import { NextRequest, NextResponse } from "next/server";

/**
 * Helper: Convert IPFS URL to HTTP gateway
 */
function resolveIpfs(url: string | undefined | null): string | undefined {
  if (!url) return undefined;
  if (typeof url !== 'string') return undefined;
  if (url.startsWith("ipfs://")) {
    return url.replace("ipfs://", "https://ipfs.io/ipfs/");
  }
  return url;
}

/**
 * Koios DRep List API Proxy
 * GET /api/koios/dreps?page={page}&search={query}&network={mainnet|preprod}
 * 
 * Uses drep_updates endpoint which includes pre-crawled meta_json
 * Then filters to only show currently registered DReps
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get("page") || "1");
    const search = searchParams.get("search") || "";
    const network = searchParams.get("network") || "mainnet";
    
    const koiosBase = network === "mainnet" 
      ? "https://api.koios.rest/api/v1"
      : "https://preprod.koios.rest/api/v1";

    const limit = 100; // Fetch more to filter registered ones
    const offset = (page - 1) * 20; // We'll return 20 per page after filtering
    
    // Step 1: Get drep_updates which includes meta_json
    // We fetch recent updates and filter for registered DReps
    const updatesResponse = await fetch(
      `${koiosBase}/drep_updates?action=eq.registered&offset=${offset}&limit=${limit}&order=block_time.desc`,
      {
        method: "GET",
        headers: { "Accept": "application/json" },
      }
    );

    if (!updatesResponse.ok) {
      console.error(`[Koios drep_updates] Error: ${updatesResponse.status}`);
      
      // Fallback to drep_list + drep_info approach
      const listResponse = await fetch(
        `${koiosBase}/drep_list?registered=eq.true&offset=${offset}&limit=20`,
        { method: "GET", headers: { "Accept": "application/json" } }
      );
      
      if (!listResponse.ok) {
        return NextResponse.json({ error: "Failed to fetch DReps" }, { status: 500 });
      }
      
      const listData = await listResponse.json();
      return NextResponse.json(listData.map((d: { drep_id: string; hex: string; registered: boolean }) => ({
        drep_id: d.drep_id,
        hex: d.hex,
        registered: d.registered,
        meta_json: null
      })));
    }

    const updates = await updatesResponse.json();
    
    // Create a map of drep_id -> latest registration data with meta_json
    // We need to find DReps that are currently registered (latest action is "registered" or "updated")
    const drepMap = new Map<string, {
      drep_id: string;
      hex: string;
      deposit: string;
      meta_url: string | null;
      meta_hash: string | null;
      meta_json: { body?: { givenName?: string; name?: string; image?: { contentUrl?: string } | string; objectives?: string; bio?: string; motivations?: string; references?: Array<{ uri?: string }> } } | null;
      block_time: number;
      action: string;
    }>();
    
    for (const update of updates) {
      const existing = drepMap.get(update.drep_id);
      // Keep the entry with latest block_time
      if (!existing || update.block_time > existing.block_time) {
        drepMap.set(update.drep_id, update);
      }
    }
    
    // Step 2: Also check drep_list to verify which are currently registered
    const listResponse = await fetch(
      `${koiosBase}/drep_list?registered=eq.true&offset=0&limit=1000`,
      { method: "GET", headers: { "Accept": "application/json" } }
    );
    
    const registeredIds = new Set<string>();
    if (listResponse.ok) {
      const listData = await listResponse.json();
      for (const d of listData) {
        if (d.registered) registeredIds.add(d.drep_id);
      }
    }
    
    // Step 3: Transform and filter - only include currently registered DReps
    const formattedDReps = Array.from(drepMap.values())
      .filter(drep => registeredIds.has(drep.drep_id))
      .slice(0, 20)
      .map(drep => {
        const meta = drep.meta_json?.body;
        const imageUrl = typeof meta?.image === 'string' 
          ? meta.image 
          : meta?.image?.contentUrl;
        
        return {
          drep_id: drep.drep_id,
          hex: drep.hex,
          registered: true,
          deposit: drep.deposit,
          meta_url: drep.meta_url,
          meta_hash: drep.meta_hash,
          // Pre-processed fields from meta_json
          name: meta?.givenName || meta?.name || undefined,
          bio: meta?.objectives || meta?.bio || meta?.motivations || undefined,
          image: resolveIpfs(imageUrl),
          website: meta?.references?.[0]?.uri || undefined,
          // Include raw meta_json for additional data
          meta_json: drep.meta_json,
        };
      });

    // If search query provided, filter by drep_id or name
    let filteredData = formattedDReps;
    if (search) {
      const searchLower = search.toLowerCase();
      filteredData = formattedDReps.filter(d => 
        d.drep_id?.toLowerCase().includes(searchLower) ||
        d.name?.toLowerCase().includes(searchLower)
      );
    }

    return NextResponse.json(filteredData, {
      headers: {
        "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120"
      }
    });
  } catch (error) {
    console.error("[Koios dreps] Exception:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
