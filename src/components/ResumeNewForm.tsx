"use client";

import { useRef, useState, FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input, Label } from "@/components/ui/Input";
import {
  ResumeFieldsForm,
  ResumeFieldsHandle,
  ResumeFieldsValue,
} from "@/components/ResumeFieldsForm";

const emptyFields: ResumeFieldsValue = {
  fullName: "",
  age: "",
  location: "",
  desiredPosition: "",
  contacts: { email: "", phone: "", telegram: "" },
  experience: [],
  education: [],
  skills: [],
  summary: "",
};

export function ResumeNewForm() {
  const router = useRouter();
  const [tab, setTab] = useState<"upload" | "builder">("upload");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Upload tab: pick a file, parse it server-side, then review/edit the
  // parsed draft using the same fields as the manual builder before saving.
  const [uploadTitle, setUploadTitle] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [uploadStep, setUploadStep] = useState<"select" | "review">("select");
  const [parsedValue, setParsedValue] = useState<ResumeFieldsValue>(emptyFields);
  const [sourceFileUrl, setSourceFileUrl] = useState<string | null>(null);
  const [parsing, setParsing] = useState(false);
  const uploadFieldsRef = useRef<ResumeFieldsHandle>(null);

  const [title, setTitle] = useState("");
  const builderFieldsRef = useRef<ResumeFieldsHandle>(null);

  async function saveResume(payload: Record<string, unknown>) {
    const res = await fetch("/api/resumes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? "Не удалось сохранить резюме");
      return;
    }
    router.push("/dashboard");
    router.refresh();
  }

  async function onParseSubmit(e: FormEvent) {
    e.preventDefault();
    if (!file) {
      setError("Выберите файл резюме");
      return;
    }
    setError(null);
    setParsing(true);
    try {
      const formData = new FormData();
      formData.set("file", file);
      const res = await fetch("/api/resumes/parse", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Не удалось разобрать файл");
        return;
      }
      setParsedValue(data.parsed);
      setSourceFileUrl(data.sourceFileUrl);
      setUploadStep("review");
    } finally {
      setParsing(false);
    }
  }

  async function onUploadReviewSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const value = uploadFieldsRef.current!.getValue();
      await saveResume({
        title: uploadTitle || file?.name || "Резюме",
        ...value,
        sourceFileUrl,
      });
    } finally {
      setLoading(false);
    }
  }

  async function onBuilderSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const value = builderFieldsRef.current!.getValue();
      await saveResume({ title, ...value });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <div className="mb-4 flex gap-2 rounded-lg bg-black/5 p-1">
        <button
          type="button"
          onClick={() => setTab("upload")}
          className={`flex-1 min-h-[44px] rounded-md py-2 text-sm font-medium transition-colors ${
            tab === "upload" ? "bg-white text-brand-dark shadow-sm" : "text-black/50"
          }`}
        >
          Загрузить файл
        </button>
        <button
          type="button"
          onClick={() => setTab("builder")}
          className={`flex-1 min-h-[44px] rounded-md py-2 text-sm font-medium transition-colors ${
            tab === "builder" ? "bg-white text-brand-dark shadow-sm" : "text-black/50"
          }`}
        >
          Заполнить пошагово
        </button>
      </div>

      <Card>
        {tab === "upload" && uploadStep === "select" && (
          <form onSubmit={onParseSubmit} className="space-y-4">
            <div>
              <Label htmlFor="uploadTitle">Название резюме</Label>
              <Input
                id="uploadTitle"
                value={uploadTitle}
                onChange={(e) => setUploadTitle(e.target.value)}
                placeholder="Например, Резюме — Frontend разработчик"
              />
            </div>
            <div>
              <Label htmlFor="file">Файл (PDF или DOCX, до 5MB)</Label>
              <input
                id="file"
                type="file"
                accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                className="block w-full text-sm text-brand-dark file:mr-4 file:rounded-lg file:border-0 file:bg-brand-dark/10 file:px-4 file:py-2 file:text-sm file:font-medium file:text-brand-dark hover:file:bg-brand-dark/15"
              />
              <p className="mt-1.5 text-xs text-black/40">
                Мы попробуем автоматически разобрать резюме по разделам — вы
                сможете проверить и поправить результат перед сохранением.
              </p>
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <Button type="submit" className="w-full" disabled={parsing}>
              {parsing ? "Разбираем резюме…" : "Разобрать резюме"}
            </Button>
          </form>
        )}

        {tab === "upload" && uploadStep === "review" && (
          <form onSubmit={onUploadReviewSubmit} className="space-y-6">
            <div className="flex items-center justify-between">
              <Label htmlFor="uploadTitleReview">Название резюме</Label>
              <button
                type="button"
                onClick={() => setUploadStep("select")}
                className="inline-flex min-h-[44px] items-center text-xs font-medium text-brand-mint hover:underline"
              >
                ← Выбрать другой файл
              </button>
            </div>
            <Input
              id="uploadTitleReview"
              required
              value={uploadTitle}
              onChange={(e) => setUploadTitle(e.target.value)}
              placeholder="Например, Резюме — Frontend разработчик"
            />
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
              Мы разобрали резюме по разделам автоматически — проверьте и
              поправьте, если что-то распознано неверно, перед сохранением.
            </p>
            <ResumeFieldsForm ref={uploadFieldsRef} initialValue={parsedValue} />
            {error && <p className="text-sm text-red-600">{error}</p>}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Сохраняем…" : "Сохранить резюме"}
            </Button>
          </form>
        )}

        {tab === "builder" && (
          <form onSubmit={onBuilderSubmit} className="space-y-6">
            <div>
              <Label htmlFor="title">Название резюме</Label>
              <Input
                id="title"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Например, Резюме — Frontend разработчик"
              />
            </div>
            <ResumeFieldsForm ref={builderFieldsRef} initialValue={emptyFields} />
            {error && <p className="text-sm text-red-600">{error}</p>}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Сохраняем…" : "Сохранить резюме"}
            </Button>
          </form>
        )}
      </Card>
    </div>
  );
}
