import { NextRequest, NextResponse } from "next/server";
import { getDexHunterApiKey, DEXHUNTER_API_URL } from "@/lib/dexhunter-server";

/**
 * Token Search API
 * GET /api/dexhunter/tokens?query={query}&verified={true|false}
 * 
 * Proxies to DexHunter API: GET /swap/tokens
 * Documentation: https://dexhunter.gitbook.io/dexhunter-partners/data/token-search
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get("query") || "";
    const verified = searchParams.get("verified");
    
    // Build URL with query params
    const url = new URL(`${DEXHUNTER_API_URL}/swap/tokens`);
    if (query) {
      url.searchParams.set("query", query);
    }
    if (verified !== null) {
      url.searchParams.set("verified", verified);
    }
    
    const apiKey = getDexHunterApiKey();
    const headers: HeadersInit = { 
      "Content-Type": "application/json" 
    };
    
    if (apiKey) {
      headers["X-Partner-Id"] = apiKey;
    }

    const res = await fetch(url.toString(), { 
      headers,
      next: { revalidate: 300 } // Cache for 5 minutes
    });

    if (!res.ok) {
      console.error(`[DexHunter tokens] Error: ${res.status} ${res.statusText}`);
      return NextResponse.json(
        { error: "Failed to fetch tokens from DexHunter" },
        { status: res.status }
      );
    }

    const data = await res.json();
    
    return NextResponse.json(data, {
      headers: {
        "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600"
      }
    });
  } catch (error) {
    console.error("[DexHunter tokens] Exception:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
