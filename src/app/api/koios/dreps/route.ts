import { NextRequest, NextResponse } from "next/server";

/**
 * Koios DRep List API Proxy
 * GET /api/koios/dreps?page={page}&search={query}&network={mainnet|preprod}
 * 
 * Proxies to Koios API to avoid CORS issues from browser
 * Uses drep_list + drep_info for complete data with metadata
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

    const limit = 20;
    const offset = (page - 1) * limit;
    
    // Step 1: Get list of registered DRep IDs
    const listUrl = `${koiosBase}/drep_list?registered=eq.true&offset=${offset}&limit=${limit}`;
    
    const listResponse = await fetch(listUrl, {
      method: "GET",
      headers: { 
        "Accept": "application/json",
      },
    });

    if (!listResponse.ok) {
      console.error(`[Koios drep_list] Error: ${listResponse.status} ${listResponse.statusText}`);
      return NextResponse.json(
        { error: "Failed to fetch DRep list from Koios" },
        { status: listResponse.status }
      );
    }

    const drepList = await listResponse.json();
    
    if (!drepList || drepList.length === 0) {
      return NextResponse.json([], {
        headers: {
          "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120"
        }
      });
    }

    // Extract DRep IDs
    const drepIds = drepList.map((d: { drep_id: string }) => d.drep_id);

    // Step 2: Get detailed info using drep_info POST endpoint
    const infoResponse = await fetch(`${koiosBase}/drep_info`, {
      method: "POST",
      headers: { 
        "Accept": "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        _drep_ids: drepIds
      }),
    });

    if (!infoResponse.ok) {
      console.error(`[Koios drep_info] Error: ${infoResponse.status} ${infoResponse.statusText}`);
      // Return basic list without detailed info
      return NextResponse.json(drepList, {
        headers: {
          "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120"
        }
      });
    }

    const drepInfos = await infoResponse.json();

    // Merge data - prioritize drep_info data but keep registered status from list
    const mergedData = drepInfos.map((info: { drep_id: string; registered?: boolean }) => ({
      ...info,
      // Ensure registered status is preserved
      registered: info.registered ?? true,
    }));

    // If search query provided, filter by drep_id
    let filteredData = mergedData;
    if (search) {
      const searchLower = search.toLowerCase();
      filteredData = mergedData.filter((d: { drep_id?: string }) => 
        d.drep_id?.toLowerCase().includes(searchLower)
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
