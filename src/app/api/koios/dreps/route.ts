import { NextRequest, NextResponse } from "next/server";

/**
 * Koios DRep List API Proxy
 * GET /api/koios/dreps?page={page}&search={query}
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
      // Search - only registered DReps
      url = `${koiosBase}/drep_list?registered=eq.true&offset=${offset}&limit=20`;
    } else {
      // Get top DReps by voting power
      url = `${koiosBase}/drep_list?registered=eq.true&offset=${offset}&limit=20&order=amount.desc`;
    }

    const response = await fetch(url, {
      method: "GET",
      headers: { 
        "Accept": "application/json",
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      console.error(`[Koios dreps] Error: ${response.status} ${response.statusText}`);
      return NextResponse.json(
        { error: "Failed to fetch DReps from Koios" },
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
    console.error("[Koios dreps] Exception:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
