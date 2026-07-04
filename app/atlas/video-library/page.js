"use client";

import { useEffect, useState } from "react";
import { KEYS, newId, readList, writeList } from "@/app/atlas/lib/storage";

const CHANNELS = ["ATLAS Shorts - Main", "ATLAS Shorts - Mystery", "ATLAS Shorts - Outdoor"];
const STATUSES = ["Pending", "Approved", "Uploaded"];

const emptyForm = {
  videoTitle: "",
  mp4Path: "",
  relatedBlogSlug: "",
  channel: CHANNELS[0],
  status: STATUSES[0],
  memo: "",
};

export default function VideoLibraryPage() {
  const [entries, setEntries] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);

  useEffect(() => {
    setEntries(readList(KEYS.videoLibrary));
  }, []);

  function updateField(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function handleSave() {
    if (!form.videoTitle.trim()) return;

    let next;
    if (editingId) {
      next = entries.map((e) =>
        e.id === editingId
          ? { ...e, ...form, updatedAt: new Date().toISOString() }
          : e
      );
    } else {
      const entry = {
        id: newId("video"),
        ...form,
        updatedAt: new Date().toISOString(),
      };
      next = [entry, ...entries];
    }
    setEntries(next);
    writeList(KEYS.videoLibrary, next);
    setForm(emptyForm);
    setEditingId(null);
  }

  function handleEdit(entry) {
    setEditingId(entry.id);
    setForm({
      videoTitle: entry.videoTitle,
      mp4Path: entry.mp4Path,
      relatedBlogSlug: entry.relatedBlogSlug,
      channel: entry.channel,
      status: entry.status,
      memo: entry.memo,
    });
  }

  function handleCancel() {
    setEditingId(null);
    setForm(emptyForm);
  }

  function handleDelete(id) {
    const next = entries.filter((e) => e.id !== id);
    setEntries(next);
    writeList(KEYS.videoLibrary, next);
    if (editingId === id) handleCancel();
  }

  return (
    <div className="px-6 py-10 sm:px-10">
      <div className="mx-auto max-w-6xl space-y-8">
        <header>
          <h1 className="text-2xl font-bold">Video Library</h1>
          <p className="mt-1 text-sm text-zinc-400">
            수동 제작한 영상의 경로 · 블로그 연결 · 상태를 등록합니다. 실제
            파일 업로드는 구현하지 않으며 경로 문자열만 입력받습니다.
          </p>
        </header>

        <section className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-5">
            <h2 className="text-lg font-semibold">
              {editingId ? "영상 정보 수정" : "새 영상 등록"}
            </h2>
            <div className="mt-4 space-y-3">
              <Field
                label="Video Title"
                value={form.videoTitle}
                onChange={(v) => updateField("videoTitle", v)}
              />
              <Field
                label="Local MP4 Path"
                value={form.mp4Path}
                onChange={(v) => updateField("mp4Path", v)}
                placeholder="C:/videos/hiking-safety-01.mp4"
              />
              <Field
                label="Related Blog Slug"
                value={form.relatedBlogSlug}
                onChange={(v) => updateField("relatedBlogSlug", v)}
                placeholder="/hiking-safety-gear-checklist"
              />
              <SelectField
                label="Channel"
                value={form.channel}
                onChange={(v) => updateField("channel", v)}
                options={CHANNELS}
              />
              <SelectField
                label="Status"
                value={form.status}
                onChange={(v) => updateField("status", v)}
                options={STATUSES}
              />
              <Field
                label="Memo"
                value={form.memo}
                onChange={(v) => updateField("memo", v)}
                textarea
              />
            </div>

            <div className="mt-4 flex gap-3">
              <button
                onClick={handleSave}
                className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500"
              >
                {editingId ? "수정 저장" : "Save Video Entry"}
              </button>
              {editingId && (
                <button
                  onClick={handleCancel}
                  className="rounded-lg bg-zinc-800 px-4 py-2 text-sm font-semibold text-zinc-100 hover:bg-zinc-700"
                >
                  취소
                </button>
              )}
            </div>
          </div>

          <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-5">
            <h2 className="text-lg font-semibold">등록된 영상 ({entries.length})</h2>
            <ul className="mt-4 space-y-3 text-sm">
              {entries.map((e) => (
                <li
                  key={e.id}
                  className="rounded-lg border border-zinc-800 p-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-medium text-zinc-100">{e.videoTitle}</p>
                      <p className="text-xs text-zinc-500">
                        {e.channel} · {e.status}
                      </p>
                      <p className="mt-1 text-xs text-zinc-400">{e.mp4Path}</p>
                      <p className="text-xs text-zinc-400">
                        Blog: {e.relatedBlogSlug || "(없음)"}
                      </p>
                    </div>
                    <div className="flex shrink-0 gap-2">
                      <button
                        onClick={() => handleEdit(e)}
                        className="text-xs text-emerald-400 hover:underline"
                      >
                        수정
                      </button>
                      <button
                        onClick={() => handleDelete(e.id)}
                        className="text-xs text-red-400 hover:underline"
                      >
                        삭제
                      </button>
                    </div>
                  </div>
                </li>
              ))}
              {entries.length === 0 && (
                <li className="text-zinc-500">등록된 영상이 없습니다.</li>
              )}
            </ul>
          </div>
        </section>
      </div>
    </div>
  );
}

function Field({ label, value, onChange, textarea, placeholder }) {
  return (
    <label className="block text-sm">
      <span className="text-zinc-400">{label}</span>
      {textarea ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={2}
          placeholder={placeholder}
          className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-100"
        />
      ) : (
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-100"
        />
      )}
    </label>
  );
}

function SelectField({ label, value, onChange, options }) {
  return (
    <label className="block text-sm">
      <span className="text-zinc-400">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-100"
      >
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </label>
  );
}
