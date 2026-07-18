import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { adaptationConfirmSchema } from "@/lib/validation";
import { scoreAts } from "@/services/aiService";
import { getOrComputeMatchAnalysis } from "@/lib/matchAnalysis";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSessionUser(request);
  if (!session) {
    return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
  }

  const { id } = await params;
  const adaptation = await db.adaptation.findUnique({
    where: { id },
    include: { resume: true, vacancy: true },
  });

  if (
    !adaptation ||
    adaptation.resume.userId !== session.userId ||
    adaptation.vacancy.userId !== session.userId
  ) {
    return NextResponse.json({ error: "Адаптация не найдена" }, { status: 404 });
  }

  const body = await request.json().catch(() => null);
  const parsed = adaptationConfirmSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Некорректные данные" },
      { status: 400 }
    );
  }

  const newResume = await db.resume.create({
    data: {
      userId: session.userId,
      title: `${adaptation.resume.title} — адаптировано`,
      contentJson: JSON.stringify(parsed.data),
      parentResumeId: adaptation.resume.id,
      version: adaptation.resume.version + 1,
      vacancyId: adaptation.vacancy.id,
      adaptationId: adaptation.id,
    },
  });

  // Score reflects what the user actually saved, not the original AI draft —
  // must key the lookup on the new resume's id, since keying on the original
  // resume's id would hit that resume's pre-adaptation cached Analysis row
  // and never recompute against the content actually being scored here.
  const matchAnalysis = await getOrComputeMatchAnalysis(
    newResume.id,
    adaptation.vacancy.id,
    parsed.data,
    adaptation.vacancy.rawText
  );
  const atsResult = await scoreAts(parsed.data, matchAnalysis);

  await db.adaptation.update({
    where: { id: adaptation.id },
    data: {
      atsScore: atsResult.score,
      recommendationsJson: JSON.stringify({
        factorScores: atsResult.factorScores,
        reasons: atsResult.reasons,
        recommendations: atsResult.recommendations,
      }),
    },
  });

  return NextResponse.json({ resume: newResume, adaptationId: adaptation.id }, { status: 201 });
}
