import { useState, useEffect } from "react";
import { useFetcher } from "react-router";
import type { Route } from "./+types/home";
import { parseFigmaVariables } from "../lib/figma-variables-parser";
import type { FigmaVariablesExport } from "../lib/figma-variables-parser";

export function meta({ }: Route.MetaArgs) {
  return [
    { title: "SyncStrings" },
    { name: "description", content: "Generate ARB and JSON localization files from Figma" },
  ];
}

type ActionResult =
  | { success: true; files: Array<{ name: string; content: string }> }
  | { success?: never; error: string };

export async function action({ request }: Route.ActionArgs) {
  const formData = await request.formData();
  const mode = formData.get("mode") as string;

  if (mode === "upload") {
    const file = formData.get("jsonFile") as File | null;

    if (!file || file.size === 0) {
      return { error: "Error: Please upload a valid JSON file." };
    }

    try {
      const text = await file.text();
      const json = JSON.parse(text);

      // Check if it's a Figma Variables export (has collections)
      if (json.collections && Array.isArray(json.collections)) {
        const result = parseFigmaVariables(json);

        const files: Array<{ name: string; content: string }> = [];
        for (const [mode, strings] of Object.entries(result.jsonGenerated)) {
          const localeInfo = result.localeMap[mode];
          if (!localeInfo) continue;

          files.push({
            name: `${localeInfo}.json`,
            content: JSON.stringify(strings, null, 2),
          });
        }

        if (files.length === 0) {
          return { error: "Error: No valid string values found in JSON." };
        }

        return { success: true, files };
      }

      // Legacy simple JSON format (flat key-value)
      const jsonGenerated: Record<string, string> = {};

      function extractKeys(obj: Record<string, unknown>, prefix = "") {
        for (const [key, value] of Object.entries(obj)) {
          const newKey = prefix ? `${prefix}_${key}` : key;
          if (typeof value === "string") {
            jsonGenerated[newKey] = value;
          } else if (typeof value === "object" && value !== null) {
            extractKeys(value as Record<string, unknown>, newKey);
          }
        }
      }

      extractKeys(json);

      if (Object.keys(jsonGenerated).length === 0) {
        return { error: "Error: No valid string values found in JSON." };
      }

      return {
        success: true,
        files: [
          { name: "locale.json", content: JSON.stringify(jsonGenerated, null, 2) },
        ],
      };
    } catch {
      return { error: "Error: The uploaded file is not valid JSON." };
    }
  }

  if (mode === "api") {
    const pat = formData.get("pat") as string;
    const link = formData.get("link") as string;

    const urlMatch = link.match(/figma\.com\/design\/([a-zA-Z0-9]+)/);

    if (!urlMatch) {
      return { error: "Error: Invalid Figma link. Please ensure it contains a file key." };
    }

    const fileKey = urlMatch[1];

    try {
      const figmaResponse = await fetch(
        `https://api.figma.com/v1/files/${fileKey}/variables/local`,
        {
          headers: {
            "X-Figma-Token": pat,
          },
        }
      );

      if (figmaResponse.status === 403) {
        return { error: "Error: Invalid Personal Access Token or insufficient permissions." };
      }

      if (!figmaResponse.ok) {
        return { error: `Error: Figma API returned ${figmaResponse.status}.` };
      }

      const figmaData: FigmaVariablesExport = await figmaResponse.json();

      if (!figmaData.collections || !Array.isArray(figmaData.collections)) {
        return { error: "Error: No variables found in this file." };
      }

      const result = parseFigmaVariables(figmaData);

      const files: Array<{ name: string; content: string }> = [];
      for (const [mode, strings] of Object.entries(result.jsonGenerated)) {
        const localeInfo = result.localeMap[mode];
        if (!localeInfo) continue;

        files.push({
          name: `${localeInfo}.json`,
          content: JSON.stringify(strings, null, 2),
        });
      }

      if (files.length === 0) {
        return { error: "Error: No valid string values found." };
      }

      return { success: true, files };
    } catch (err) {
      return { error: `Error: Failed to fetch from Figma. ${err instanceof Error ? err.message : "Unknown error"}` };
    }
  }

  return { error: "Error: Invalid mode." };
}

function downloadFile(content: string, filename: string) {
  const blob = new Blob([content], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export default function Home() {
  const [mode, setMode] = useState<"api" | "upload">("upload");
  const [previewFiles, setPreviewFiles] = useState<Array<{ name: string; content: string; renamed: string }>>([]);
  const [renamedFiles, setRenamedFiles] = useState<Record<number, string>>({});
  const fetcher = useFetcher<ActionResult>();

  const isProcessing = fetcher.state !== "idle";

  // Handle successful generation - show preview
  useEffect(() => {
    if (fetcher.data && "files" in fetcher.data) {
      setPreviewFiles(
        fetcher.data.files.map((f) => ({ ...f, renamed: f.name }))
      );
      setRenamedFiles({});
    }
  }, [fetcher.data]);

  function handleDownload() {
    for (const file of previewFiles) {
      const finalName = renamedFiles[previewFiles.indexOf(file)] ?? file.renamed;
      downloadFile(file.content, finalName);
    }
  }

  function handleDownloadSingle(index: number) {
    const file = previewFiles[index];
    const finalName = renamedFiles[index] ?? file.renamed;
    downloadFile(file.content, finalName);
  }

  function handleCancel() {
    setPreviewFiles([]);
    setRenamedFiles({});
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC] flex items-center justify-center p-6">
      <div className="w-full max-w-lg">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-semibold text-[#191c1e] tracking-tight">
            SyncStrings
          </h1>
          <p className="mt-2 text-sm text-[#64748b]">
            Generate localization files from Figma
          </p>
        </div>

        {/* Main Card */}
        <div className="bg-white rounded-lg border border-[#E2E8F0] shadow-sm">
          {/* Mode Toggle */}
          <div className="flex border-b border-[#E2E8F0]">
            <button
              type="button"
              onClick={() => setMode("upload")}
              className={`flex-1 px-4 py-3 text-sm font-medium transition-colors cursor-pointer ${mode === "upload"
                ? "text-[#2563EB] border-b-2 border-[#2563EB] bg-[#F8FAFC]"
                : "text-[#64748b] hover:text-[#191c1e] hover:bg-[#F8FAFC]"
                }`}
            >
              Upload JSON
            </button>
            <button
              type="button"
              onClick={() => setMode("api")}
              className={`flex-1 px-4 py-3 text-sm font-medium transition-colors cursor-pointer ${mode === "api"
                ? "text-[#2563EB] border-b-2 border-[#2563EB] bg-[#F8FAFC]"
                : "text-[#64748b] hover:text-[#191c1e] hover:bg-[#F8FAFC]"
                }`}
            >
              Fetch via API
            </button>
          </div>

          {/* Form */}
          <div className="p-6">
            {mode === "upload" && (
              <fetcher.Form
                method="post"
                encType="multipart/form-data"
                className="space-y-4"
              >
                <input type="hidden" name="mode" value={mode} />

                <div>
                  <label
                    htmlFor="jsonFile"
                    className="block text-sm font-medium text-[#191c1e] mb-2"
                  >
                    Figma Variables JSON
                  </label>
                  <input
                    type="file"
                    id="jsonFile"
                    name="jsonFile"
                    accept=".json"
                    className="w-full px-3 py-2 border border-[#E2E8F0] rounded-lg text-sm text-[#191c1e]
                               file:mr-4 file:py-1 file:px-3 file:rounded file:border-0
                               file:text-sm file:font-medium file:bg-[#F8FAFC] file:text-[#191c1e]
                               hover:file:bg-[#E2E8F0] cursor-pointer
                               focus:outline-none focus:ring-2 focus:ring-[#2563EB]/40 focus:border-[#2563EB]"
                  />
                  <p className="mt-1 text-xs text-[#64748b]">
                    Upload exported Figma Variables JSON
                  </p>
                </div>

                <button
                  type="submit"
                  disabled={isProcessing}
                  className="w-full py-2.5 px-4 bg-[#2563EB] text-white text-sm font-medium rounded-lg
                             hover:bg-[#1D4ED8] transition-colors cursor-pointer
                             disabled:opacity-50 disabled:cursor-not-allowed
                             focus:outline-none focus:ring-2 focus:ring-[#2563EB]/40 focus:ring-offset-2"
                >
                  {isProcessing ? "Processing..." : "Generate Files"}
                </button>
              </fetcher.Form>
            )}

            {mode === "api" && (
              <fetcher.Form
                method="post"
                encType="multipart/form-data"
                className="space-y-4"
              >
                <input type="hidden" name="mode" value={mode} />

                <div>
                  <label
                    htmlFor="pat"
                    className="block text-sm font-medium text-[#191c1e] mb-2"
                  >
                    Figma Personal Access Token
                  </label>
                  <input
                    type="password"
                    id="pat"
                    name="pat"
                    placeholder="figd_xxxxxxxxxxxxxx"
                    className="w-full px-3 py-2 border border-[#E2E8F0] rounded-lg text-sm text-[#191c1e]
                               placeholder:text-[#94A3B8]
                               focus:outline-none focus:ring-2 focus:ring-[#2563EB]/40 focus:border-[#2563EB]"
                  />
                </div>

                <div>
                  <label
                    htmlFor="link"
                    className="block text-sm font-medium text-[#191c1e] mb-2"
                  >
                    Figma Link
                  </label>
                  <input
                    type="text"
                    id="link"
                    name="link"
                    placeholder="https://www.figma.com/design/..."
                    className="w-full px-3 py-2 border border-[#E2E8F0] rounded-lg text-sm text-[#191c1e]
                               placeholder:text-[#94A3B8]
                               focus:outline-none focus:ring-2 focus:ring-[#2563EB]/40 focus:border-[#2563EB]"
                  />
                  <p className="mt-1 text-xs text-[#64748b]">
                    Link to Figma frame containing text layers
                  </p>
                </div>

                <button
                  type="submit"
                  disabled={isProcessing}
                  className="w-full py-2.5 px-4 bg-[#2563EB] text-white text-sm font-medium rounded-lg
                             hover:bg-[#1D4ED8] transition-colors cursor-pointer
                             disabled:opacity-50 disabled:cursor-not-allowed
                             focus:outline-none focus:ring-2 focus:ring-[#2563EB]/40 focus:ring-offset-2"
                >
                  {isProcessing ? "Processing..." : "Generate Files"}
                </button>
              </fetcher.Form>
            )}

            {/* Error Feedback */}
            {fetcher.data && "error" in fetcher.data && (
              <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg">
                <p className="text-sm text-red-700">{fetcher.data.error}</p>
              </div>
            )}

            {/* File Preview & Rename */}
            {previewFiles.length > 0 && (
              <div className="mt-4 space-y-4">
                <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
                  <p className="text-sm font-medium text-green-800 mb-3">
                    Generated Files ({previewFiles.length})
                  </p>
                  <div className="space-y-2">
                    {previewFiles.map((file, index) => (
                      <div key={index} className="flex items-center gap-2">
                        <input
                          type="text"
                          value={renamedFiles[index] ?? file.renamed}
                          onChange={(e) =>
                            setRenamedFiles((prev) => ({ ...prev, [index]: e.target.value }))
                          }
                          className="flex-1 px-2 py-1.5 border border-[#E2E8F0] rounded text-sm text-[#191c1e]
                                     focus:outline-none focus:ring-2 focus:ring-[#2563EB]/40 focus:border-[#2563EB]"
                        />
                        <span className="text-xs text-[#64748b] truncate max-w-20 hidden sm:block">
                          {file.content.length} bytes
                        </span>
                        <button
                          type="button"
                          onClick={() => handleDownloadSingle(index)}
                          className="px-3 py-1.5 text-xs font-medium text-[#2563EB] border border-[#2563EB] rounded
                                     hover:bg-[#2563EB]/10 transition-colors cursor-pointer"
                        >
                          Download
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={handleDownload}
                    className="flex-1 py-2.5 px-4 bg-[#2563EB] text-white text-sm font-medium rounded-lg
                               hover:bg-[#1D4ED8] transition-colors cursor-pointer
                               focus:outline-none focus:ring-2 focus:ring-[#2563EB]/40 focus:ring-offset-2"
                  >
                    Download All
                  </button>
                  <button
                    type="button"
                    onClick={handleCancel}
                    className="py-2.5 px-4 border border-[#E2E8F0] text-[#64748b] text-sm font-medium rounded-lg
                               hover:bg-[#F8FAFC] transition-colors cursor-pointer
                               focus:outline-none focus:ring-2 focus:ring-[#2563EB]/40"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}