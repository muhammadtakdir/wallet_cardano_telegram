import { NextRequest, NextResponse } from "next/server";

/**
 * Koios Pool List API Proxy
 * GET /api/koios/pools?page={page}&search={query}
 * 
 * Proxies to Koios API to avoid CORS issues from browser
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

    const offset = (page - 1) * 20;
    
    let url: string;
    if (search) {
      // Search by ticker (case-insensitive) - only registered pools
      url = `${koiosBase}/pool_list?pool_status=eq.registered&ticker=ilike.*${encodeURIComponent(search)}*&offset=${offset}&limit=20`;
    } else {
      // Get top pools by active stake
      url = `${koiosBase}/pool_list?pool_status=eq.registered&offset=${offset}&limit=20&order=active_stake.desc`;
    }

    const response = await fetch(url, {
      method: "GET",
      headers: { 
        "Accept": "application/json",
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      console.error(`[Koios pools] Error: ${response.status} ${response.statusText}`);
      return NextResponse.json(
        { error: "Failed to fetch pools from Koios" },
        { status: response.status }
      );
    }

    const data = await response.json();
    
    return NextResponse.json(data, {
      headers: {
        "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120"
      }
    });
  } catch (error) {
    console.error("[Koios pools] Exception:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
