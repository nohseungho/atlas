import { NextResponse } from "next/server";
import { readJson, writeJson } from "@/lib/data-store";
import { calculateMoneyScore } from "@/lib/money-score";

const FILE = "keywords.json";

export async function GET() {
  const data = readJson(FILE);
  return NextResponse.json(data);
}

export async function POST(request) {
  const body = await request.json();

  if (!body.keyword || !body.category) {
    return NextResponse.json(
      { error: "keyword and category are required" },
      { status: 400 }
    );
  }

  const data = readJson(FILE);
  const now = new Date().toISOString();

  const maxNum = data.keywords.reduce((max, item) => {
    const match = /^kw_(\d+)$/.exec(item.id || "");
    return match ? Math.max(max, Number(match[1])) : max;
  }, 0);

  const levels = {
    searchVolumeLevel: Number(body.searchVolumeLevel) || 1,
    cpcLevel: Number(body.cpcLevel) || 1,
    competitionLevel: Number(body.competitionLevel) || 1,
    commercialLevel: Number(body.commercialLevel) || 1,
    seasonality: Number(body.seasonality) || 1,
  };

  const keyword = {
    id: `kw_${String(maxNum + 1).padStart(3, "0")}`,
    keyword: body.keyword,
    category: body.category,
    intent: body.intent || "informational",
    ...levels,
    moneyScore: calculateMoneyScore(levels),
    status: "idea",
    memo: body.memo || "",
    createdAt: now,
    updatedAt: now,
  };

  data.keywords.push(keyword);
  writeJson(FILE, data);

  return NextResponse.json(keyword, { status: 201 });
}

export async function PATCH(request) {
  const body = await request.json();

  if (!body.id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  const data = readJson(FILE);
  const keyword = data.keywords.find((item) => item.id === body.id);

  if (!keyword) {
    return NextResponse.json({ error: "keyword not found" }, { status: 404 });
  }

  if (body.status) keyword.status = body.status;
  if (typeof body.memo === "string") keyword.memo = body.memo;
  keyword.updatedAt = new Date().toISOString();

  writeJson(FILE, data);

  return NextResponse.json(keyword);
}
