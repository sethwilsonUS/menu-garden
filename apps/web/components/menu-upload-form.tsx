"use client";

import Link from "next/link";
import type { ChangeEvent, DragEvent, FormEvent } from "react";
import { useEffect, useRef, useState } from "react";
import { useConvex, useMutation, useQuery } from "convex/react";
import { getAnonymousClientId } from "@/lib/anonymous-client";
import { api } from "@menu-garden/shared/convex/_generated/api";
import type { Id } from "@menu-garden/shared/convex/_generated/dataModel";
import type { MenuSummary } from "@menu-garden/shared/types";
import { PublicMenuView } from "./public-menu-view";
import {
  MenuListIcon,
  MessageForkIcon,
  PlateSeedlingMark,
  UploadTrayIcon,
} from "./brand-mark";
import { MenuParseProgress } from "./menu-parse-progress";

const acceptedTypes = ["application/pdf", "image/png", "image/jpeg", "image/webp"];
const maxFiles = 8;
const maxFileSizeBytes = 20 * 1024 * 1024;
const maxTotalSizeBytes = 45 * 1024 * 1024;
const defaultUploadName = "Uploaded menu";
const existingMenuMessage =
  "We found this menu already. Opening the accessible version.";

function isAcceptedFile(file: File) {
  return acceptedTypes.includes(file.type) || file.name.toLowerCase().endsWith(".pdf");
}

function getSourceType(file: File) {
  if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) {
    return "pdf" as const;
  }

  return "image" as const;
}

function formatFileSize(size: number) {
  const megabytes = size / (1024 * 1024);

  return `${megabytes.toFixed(megabytes >= 10 ? 0 : 1)} MB`;
}

function getFileTypeLabel(file: File) {
  return getSourceType(file) === "pdf" ? "PDF file" : "Image file";
}

function getSelectedFilesHelp(files: File[]) {
  if (files.length === 0) {
    return null;
  }

  const sourceTypes = new Set(files.map(getSourceType));

  if (sourceTypes.size > 1) {
    return "Use either PDFs or photos for one menu, not both.";
  }

  if (sourceTypes.has("pdf")) {
    return "Each PDF appears as one selected file here. Multi-page PDFs keep their internal page order and are split into pages after upload.";
  }

  return "Photos and images are read in this order. Move files if the menu pages are out of sequence.";
}

function CameraIcon() {
  return (
    <svg aria-hidden="true" fill="none" height="18" viewBox="0 0 24 24" width="18">
      <path
        d="M7 7.5 8.4 5h7.2L17 7.5h2A2.5 2.5 0 0 1 21.5 10v6.5A2.5 2.5 0 0 1 19 19H5a2.5 2.5 0 0 1-2.5-2.5V10A2.5 2.5 0 0 1 5 7.5h2Z"
        stroke="currentColor"
        strokeLinejoin="round"
        strokeWidth="2"
      />
      <path
        d="M12 16a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z"
        stroke="currentColor"
        strokeWidth="2"
      />
    </svg>
  );
}

function MoveUpIcon() {
  return (
    <svg aria-hidden="true" fill="none" height="18" viewBox="0 0 24 24" width="18">
      <path
        d="M12 5v14m0-14-5 5m5-5 5 5"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
      />
    </svg>
  );
}

function MoveDownIcon() {
  return (
    <svg aria-hidden="true" fill="none" height="18" viewBox="0 0 24 24" width="18">
      <path
        d="M12 19V5m0 14-5-5m5 5 5-5"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
      />
    </svg>
  );
}

function RemoveIcon() {
  return (
    <svg aria-hidden="true" fill="none" height="18" viewBox="0 0 24 24" width="18">
      <path
        d="M6 6l12 12M18 6 6 18"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="2"
      />
    </svg>
  );
}

async function getSha256Hex(file: File) {
  if (!globalThis.crypto?.subtle) {
    throw new Error("Browser file hashing is not available.");
  }

  const digest = await globalThis.crypto.subtle.digest(
    "SHA-256",
    await file.arrayBuffer()
  );

  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("");
}

async function getFileHashes(files: File[]) {
  return await Promise.all(files.map((file) => getSha256Hex(file)));
}

function getFileError(files: File[]) {
  if (files.length === 0) {
    return "Choose at least one menu photo or PDF file.";
  }

  if (files.length > maxFiles) {
    return `Choose ${maxFiles} files or fewer for one menu.`;
  }

  if (files.some((file) => !isAcceptedFile(file))) {
    return "Use PDF, PNG, JPEG, or WEBP files.";
  }

  if (files.some((file) => file.size > maxFileSizeBytes)) {
    return `Each file must be ${formatFileSize(maxFileSizeBytes)} or smaller.`;
  }

  const totalSize = files.reduce((sum, file) => sum + file.size, 0);

  if (totalSize > maxTotalSizeBytes) {
    return `This menu is ${formatFileSize(totalSize)}. Keep one upload under ${formatFileSize(
      maxTotalSizeBytes
    )}.`;
  }

  const sourceTypes = new Set(files.map(getSourceType));

  if (sourceTypes.size > 1) {
    return "Upload either PDFs or photos for one menu, not a mix of both.";
  }

  return null;
}

function moveItem<T>(items: T[], index: number, direction: -1 | 1) {
  const nextIndex = index + direction;

  if (nextIndex < 0 || nextIndex >= items.length) {
    return items;
  }

  const nextItems = [...items];
  const [item] = nextItems.splice(index, 1);
  nextItems.splice(nextIndex, 0, item);

  return nextItems;
}

type MenuUploadFormProps = {
  initialRestaurantName?: string;
  initialGooglePlaceId?: string;
  initialFormattedAddress?: string;
  initialLatitude?: number;
  initialLongitude?: number;
  initialZipCode?: string;
  initialCuisineType?: string;
};

export function MenuUploadForm({
  initialRestaurantName,
  initialGooglePlaceId,
  initialFormattedAddress,
  initialLatitude,
  initialLongitude,
  initialZipCode,
  initialCuisineType,
}: MenuUploadFormProps) {
  const [anonymousClientId, setAnonymousClientId] = useState<string | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [menuId, setMenuId] = useState<Id<"menus"> | null>(null);
  const [wasDuplicateReuse, setWasDuplicateReuse] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [publicRestaurantName, setPublicRestaurantName] = useState(
    initialRestaurantName ?? ""
  );
  const [publicMenuTitle, setPublicMenuTitle] = useState("");
  const [detailsMessage, setDetailsMessage] = useState<string | null>(null);
  const [shareMessage, setShareMessage] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState(
    "Choose menu photos or PDFs to begin."
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSavingDetails, setIsSavingDetails] = useState(false);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const resultHeadingRef = useRef<HTMLHeadingElement>(null);

  const convex = useConvex();
  const generateUploadUrl = useMutation(api.files.generateUploadUrl);
  const createMenuFromUploads = useMutation(api.menus.createMenuFromUploads);
  const updateUploadedMenuDetails = useMutation(api.menus.updateUploadedMenuDetails);
  const menu = useQuery(api.menus.getMenu, menuId ? { menuId } : "skip") as
    | MenuSummary
    | null
    | undefined;
  const canUpload = Boolean(anonymousClientId) && !isSubmitting;
  const selectedFilesHelp = getSelectedFilesHelp(files);

  useEffect(() => {
    setAnonymousClientId(getAnonymousClientId());
  }, []);

  useEffect(() => {
    const parseJobMessage = menu?.parseJob?.message;

    if (parseJobMessage) {
      setStatusMessage((current) =>
        current === existingMenuMessage ? current : parseJobMessage
      );
    }

    if (menu?.parseJob?.status === "ready") {
      resultHeadingRef.current?.focus();
    }
  }, [menu?.parseJob?.message, menu?.parseJob?.status]);

  function resetResultState() {
    setMenuId(null);
    setWasDuplicateReuse(false);
    setDetailsMessage(null);
    setShareMessage(null);
  }

  function resetFileInputValues() {
    if (cameraInputRef.current) {
      cameraInputRef.current.value = "";
    }

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }

  function updateSelectedFiles(selectedFiles: File[]) {
    const selectedFileError = selectedFiles.length ? getFileError(selectedFiles) : null;

    setFiles(selectedFiles);
    setFormError(selectedFileError);
    resetResultState();
    setStatusMessage(
      selectedFiles.length
        ? `${selectedFiles.length} file${selectedFiles.length === 1 ? "" : "s"} selected.`
        : "Choose menu photos or PDFs to begin."
    );
    resetFileInputValues();
  }

  function handleFilePickerChange(event: ChangeEvent<HTMLInputElement>) {
    const selectedFiles = Array.from(event.target.files ?? []);

    if (selectedFiles.length === 0) {
      return;
    }

    updateSelectedFiles(selectedFiles);
  }

  function handleCameraFilesChange(event: ChangeEvent<HTMLInputElement>) {
    const selectedFiles = Array.from(event.target.files ?? []);

    if (selectedFiles.length === 0) {
      return;
    }

    if (files.some((file) => getSourceType(file) === "pdf")) {
      setFormError("Remove selected PDFs before taking menu photos.");
      resetFileInputValues();
      return;
    }

    updateSelectedFiles([...files, ...selectedFiles]);
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    updateSelectedFiles(Array.from(event.dataTransfer.files));
  }

  function removeFile(index: number) {
    const nextFiles = files.filter((_, fileIndex) => fileIndex !== index);
    const nextFileError = nextFiles.length ? getFileError(nextFiles) : null;

    setFiles(nextFiles);
    setFormError(nextFileError);
    resetResultState();
    setStatusMessage(
      nextFiles.length
        ? `${nextFiles.length} file${nextFiles.length === 1 ? "" : "s"} selected.`
        : "Choose menu photos or PDFs to begin."
    );

    if (nextFiles.length === 0) {
      resetFileInputValues();
    }
  }

  async function submitSelectedFiles({ skipDuplicateCheck = false } = {}) {
    const fileError = getFileError(files);

    if (!anonymousClientId) {
      setFormError("The upload page is still getting ready. Try again in a moment.");
      return;
    }

    if (fileError) {
      setFormError(fileError);
      return;
    }

    setFormError(null);
    setIsSubmitting(true);
    setWasDuplicateReuse(false);
    setShareMessage(null);
    setStatusMessage(
      skipDuplicateCheck
        ? "Getting ready to read this menu again."
        : "Getting ready to upload."
    );

    try {
      const sourceType = getSourceType(files[0]);
      let fileHashes: string[] | undefined;

      if (!skipDuplicateCheck) {
        try {
          setStatusMessage("Checking whether this menu was already uploaded.");
          fileHashes = await getFileHashes(files);

          const existingMenu = await convex.query(
            api.menus.findMenuByUploadFingerprint,
            {
              fileHashes,
              sourceType,
            }
          );

          if (existingMenu) {
            setMenuId(existingMenu.menuId);
            setWasDuplicateReuse(true);
            setStatusMessage(existingMenuMessage);
            return;
          }
        } catch (duplicateCheckError) {
          console.warn("Menu duplicate check skipped.", duplicateCheckError);
          setStatusMessage("Getting ready to upload.");
        }
      } else {
        try {
          fileHashes = await getFileHashes(files);
        } catch (hashError) {
          console.warn("Menu upload fingerprint skipped.", hashError);
        }
      }

      const storageIds: Array<Id<"_storage">> = [];

      for (const [index, selectedFile] of files.entries()) {
        const uploadUrl = await generateUploadUrl();
        setStatusMessage(`Uploading file ${index + 1} of ${files.length}.`);
        const uploadResponse = await fetch(uploadUrl, {
          method: "POST",
          headers: { "Content-Type": selectedFile.type || "application/octet-stream" },
          body: selectedFile,
        });

        if (!uploadResponse.ok) {
          throw new Error(`File ${index + 1} could not be uploaded.`);
        }

        const { storageId } = (await uploadResponse.json()) as {
          storageId: Id<"_storage">;
        };
        storageIds.push(storageId);
      }

      setStatusMessage("Starting menu reading.");
      const result = await createMenuFromUploads({
        storageIds,
        restaurantName: initialRestaurantName?.trim() || defaultUploadName,
        menuTitle: defaultUploadName,
        sourceType,
        anonymousClientId,
        fileHashes,
        googlePlaceId: initialGooglePlaceId,
        formattedAddress: initialFormattedAddress,
        latitude: initialLatitude,
        longitude: initialLongitude,
        zipCode: initialZipCode,
        cuisineType: initialCuisineType,
      });

      setMenuId(result.menuId);
      setStatusMessage("Menu reading will start soon.");
    } catch (error) {
      console.error(error);
      setFormError(
        error instanceof Error ? error.message : "We could not upload that menu."
      );
      setStatusMessage("We could not upload that menu.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await submitSelectedFiles();
  }

  async function handleDetailsSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!menuId) {
      return;
    }

    const restaurantName = publicRestaurantName.trim();
    const menuTitle = publicMenuTitle.trim();

    if (!restaurantName && !menuTitle) {
      setDetailsMessage("Enter a restaurant name or menu title to save publicly.");
      return;
    }

    setIsSavingDetails(true);
    setDetailsMessage("Saving this menu publicly.");

    try {
      await updateUploadedMenuDetails({
        menuId,
        restaurantName: restaurantName || undefined,
        menuTitle: menuTitle || undefined,
        anonymousClientId: anonymousClientId ?? undefined,
      });
      setDetailsMessage("Menu saved publicly. It will appear in Browse menus when ready.");
    } catch (error) {
      console.error(error);
      setDetailsMessage("Menu details could not be saved. Try again in a moment.");
    } finally {
      setIsSavingDetails(false);
    }
  }

  async function handleCopyMenuLink() {
    if (!menuId) {
      return;
    }

    const url = `${window.location.origin}/menu/${menuId}`;

    try {
      await navigator.clipboard.writeText(url);
      setShareMessage("Menu link copied.");
    } catch {
      setShareMessage(url);
    }
  }

  return (
    <div className="mx-auto grid w-full max-w-6xl gap-10 px-4 py-10 sm:px-6 lg:px-8">
      <section
        aria-labelledby="upload-menu-heading"
        className="grid gap-8 lg:grid-cols-[minmax(0,0.95fr)_minmax(22rem,1fr)] lg:items-start"
      >
        <div className="animate-fade-in-up space-y-7">
          <div className="space-y-5">
            <p className="accent-pill w-fit">
              <PlateSeedlingMark size={16} />
              Accessible menu reader
            </p>
            <div className="space-y-4">
              <h1
                className="font-display text-[clamp(2.5rem,7vw,5rem)] font-semibold leading-[1.05] text-foreground"
                id="upload-menu-heading"
              >
                Upload a menu. Ask what sounds good.
              </h1>
              <p className="max-w-xl text-lg leading-8 text-foreground-2">
                Turn photos and PDFs into readable menu text, then ask about
                allergens, prices, dietary options, or the dish with the least
                ordering anxiety.
              </p>
            </div>
          </div>

          <ul
            aria-label="Menu Garden workflow"
            className="grid gap-3 text-sm leading-6 text-foreground-2 sm:grid-cols-3"
          >
            <li className="garden-bed px-4 py-4">
              <UploadTrayIcon className="mb-3 text-accent" />
              Upload menu pages
            </li>
            <li className="garden-bed px-4 py-4">
              <MenuListIcon className="mb-3 text-accent" />
              Get structured text
            </li>
            <li className="garden-bed px-4 py-4">
              <MessageForkIcon className="mb-3 text-accent" />
              Ask plain questions
            </li>
          </ul>

        </div>

        <form
          className="garden-bed menu-paper animate-fade-in-up-delay-1 space-y-6 px-5 py-5 sm:px-6 sm:py-6"
          onSubmit={handleSubmit}
        >
          {initialRestaurantName ? (
            <section className="rounded-xl border border-border bg-surface px-4 py-4">
              <h2 className="text-lg font-semibold tracking-tight">
                Uploading for {initialRestaurantName}
              </h2>
              {initialFormattedAddress ? (
                <p className="mt-1 text-sm leading-6 text-foreground-2">
                  {initialFormattedAddress}
                </p>
              ) : null}
            </section>
          ) : null}

          <div className="space-y-3">
            <div
              className="flex min-h-72 flex-col items-center justify-center gap-5 rounded-2xl border-2 border-dashed border-accent-border bg-surface px-5 py-8 text-center focus-within:border-accent focus-within:shadow-[0_0_0_3px_var(--color-accent-glow)]"
              onDragOver={(event) => event.preventDefault()}
              onDrop={handleDrop}
            >
              <div
                aria-hidden="true"
                className="flex h-16 w-16 items-center justify-center rounded-2xl border border-accent-border bg-accent-bg text-accent"
              >
                <UploadTrayIcon />
              </div>
              <div className="space-y-2">
                <p
                  className="font-display text-2xl font-semibold text-foreground"
                  id="menu-file-label"
                >
                  Choose menu photos or PDFs
                </p>
                <p
                  className="mx-auto max-w-md text-sm leading-6 text-foreground-2"
                  id="menu-file-help"
                >
                  Take photos on supported phones, or choose PDFs, PNGs, saved
                  photos, and screenshots. Use PDFs or photos, one type per menu.
                  Selected file order matters; PDFs keep their internal page order.
                </p>
              </div>
              <div className="flex w-full flex-col items-stretch justify-center gap-3 sm:w-auto sm:flex-row">
                <label className="button-primary relative isolate overflow-hidden focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-accent">
                  <input
                    accept="image/*"
                    aria-describedby="menu-file-help menu-camera-help upload-status upload-error"
                    aria-invalid={Boolean(formError)}
                    capture="environment"
                    className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                    id="menu-camera-file"
                    multiple
                    onChange={handleCameraFilesChange}
                    ref={cameraInputRef}
                    type="file"
                  />
                  <CameraIcon />
                  <span>Take photos</span>
                </label>
                <label className="button-secondary relative isolate overflow-hidden focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-accent">
                  <input
                    accept="application/pdf,image/png,image/jpeg,image/webp"
                    aria-describedby="menu-file-help upload-status upload-error"
                    aria-invalid={Boolean(formError)}
                    className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                    id="menu-file"
                    multiple
                    onChange={handleFilePickerChange}
                    ref={fileInputRef}
                    type="file"
                  />
                  <UploadTrayIcon />
                  <span>Choose files</span>
                </label>
              </div>
              <p
                className="mx-auto max-w-md text-xs leading-5 text-foreground-2"
                id="menu-camera-help"
              >
                Camera support depends on your browser. If Take photos opens a
                file picker, choose saved photos instead. For multi-page menus,
                take one photo per page in order.
              </p>
            </div>
          </div>

          {files.length ? (
            <section
              aria-labelledby="selected-files-heading"
              className="rounded-2xl border border-border bg-surface px-4 py-4"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="font-display text-xl font-semibold" id="selected-files-heading">
                  Selected files
                </h2>
                <span className="tag">
                  {files.length} file{files.length === 1 ? "" : "s"}
                </span>
              </div>
              {selectedFilesHelp ? (
                <p className="mt-2 text-sm leading-6 text-foreground-2">
                  {selectedFilesHelp}
                </p>
              ) : null}
              <ol className="mt-4 space-y-2">
                {files.map((selectedFile, index) => (
                  <li
                    className="grid gap-3 rounded-xl border border-border bg-surface-2 px-3 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
                    key={`${selectedFile.name}-${selectedFile.size}-${selectedFile.lastModified}-${index}`}
                  >
                    <div className="min-w-0">
                      <p className="break-words text-sm font-semibold">
                        File {index + 1}: {selectedFile.name}
                      </p>
                      <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-foreground-2">
                        <span>{getFileTypeLabel(selectedFile)}</span>
                        <span aria-hidden="true">·</span>
                        <span>{formatFileSize(selectedFile.size)}</span>
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2 sm:justify-end">
                      <button
                        aria-label={`Move ${selectedFile.name} up`}
                        className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-surface text-foreground-2 hover:border-accent-border hover:bg-surface-3 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
                        disabled={index === 0}
                        onClick={() => setFiles((current) => moveItem(current, index, -1))}
                        title="Move up"
                        type="button"
                      >
                        <MoveUpIcon />
                      </button>
                      <button
                        aria-label={`Move ${selectedFile.name} down`}
                        className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-surface text-foreground-2 hover:border-accent-border hover:bg-surface-3 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
                        disabled={index === files.length - 1}
                        onClick={() => setFiles((current) => moveItem(current, index, 1))}
                        title="Move down"
                        type="button"
                      >
                        <MoveDownIcon />
                      </button>
                      <button
                        aria-label={`Remove ${selectedFile.name}`}
                        className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-surface text-foreground-2 hover:border-accent-border hover:bg-surface-3 hover:text-foreground"
                        onClick={() => removeFile(index)}
                        title="Remove"
                        type="button"
                      >
                        <RemoveIcon />
                      </button>
                    </div>
                  </li>
                ))}
              </ol>
            </section>
          ) : null}

          {formError ? (
            <p className="alert-banner alert-error text-sm font-semibold" id="upload-error" role="alert">
              {formError}
            </p>
          ) : (
            <span className="sr-only" id="upload-error">
              No upload errors.
            </span>
          )}

          <div
            aria-live="polite"
            className="rounded-2xl border border-border bg-surface px-4 py-4"
            id="upload-status"
            role="status"
          >
            <p className="font-semibold">{statusMessage}</p>
            <MenuParseProgress parseJob={menu?.parseJob} />
            {menu?.parseJob?.warnings?.length ? (
              <ul className="mt-3 list-disc space-y-1 pl-5 text-sm leading-6 text-foreground-2">
                {menu.parseJob.warnings.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            ) : null}
          </div>

          <button
            className="button-primary w-full sm:w-auto"
            disabled={!canUpload || files.length === 0}
            type="submit"
          >
            {isSubmitting ? "Uploading menu" : "Read this menu"}
          </button>
        </form>
      </section>

      {menuId ? (
        <section className="space-y-6">
          <header className="flex flex-wrap items-center justify-between gap-3">
            <h2
              className="font-display text-3xl font-semibold tracking-tight"
              ref={resultHeadingRef}
              tabIndex={-1}
            >
              Accessible menu result
            </h2>
            <div className="flex flex-wrap gap-3">
              <Link className="button-primary" href={`/chat/${menuId}`}>
                Chat with this menu
              </Link>
              <Link className="button-secondary" href={`/menu/${menuId}`}>
                Open menu page
              </Link>
              <button className="button-secondary" onClick={handleCopyMenuLink} type="button">
                Copy link
              </button>
              <Link className="button-secondary" href="/">
                Add another menu
              </Link>
            </div>
          </header>
          {shareMessage ? (
            <p aria-live="polite" className="text-sm text-foreground-2">
              {shareMessage}
            </p>
          ) : null}
          {wasDuplicateReuse ? (
            <section className="garden-bed menu-paper space-y-3 px-6 py-5">
              <h3 className="font-display text-2xl font-semibold">
                Want a fresh scan?
              </h3>
              <p className="text-sm leading-6 text-foreground-2">
                Menu Garden reused a previous result to save time and AI cost.
                If this file should be read again, start a new scan from the
                selected upload.
              </p>
              <button
                className="button-secondary w-full sm:w-auto"
                disabled={!canUpload || files.length === 0}
                onClick={() => void submitSelectedFiles({ skipDuplicateCheck: true })}
                type="button"
              >
                {isSubmitting ? "Reading again" : "Read this file again"}
              </button>
            </section>
          ) : null}
          {!wasDuplicateReuse ? (
            <form className="garden-bed menu-paper space-y-4 px-6 py-6" onSubmit={handleDetailsSubmit}>
              <div className="space-y-2">
                <h3 className="font-display text-2xl font-semibold">
                  Save this menu publicly
                </h3>
                <p className="text-sm leading-6 text-foreground-2">
                  Add a restaurant name or menu title to include this menu in Browse
                  menus. The direct link works either way.
                </p>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <label className="block text-sm font-semibold" htmlFor="detail-restaurant">
                    Restaurant name
                  </label>
                  <input
                    autoComplete="organization"
                    className="input-field"
                    id="detail-restaurant"
                    onChange={(event) => setPublicRestaurantName(event.target.value)}
                    placeholder="Restaurant name"
                    type="text"
                    value={publicRestaurantName}
                  />
                </div>
                <div className="space-y-2">
                  <label className="block text-sm font-semibold" htmlFor="detail-title">
                    Menu title
                  </label>
                  <input
                    className="input-field"
                    id="detail-title"
                    onChange={(event) => setPublicMenuTitle(event.target.value)}
                    placeholder="Lunch menu"
                    type="text"
                    value={publicMenuTitle}
                  />
                </div>
              </div>
              {detailsMessage ? (
                <p aria-live="polite" className="text-sm text-foreground-2">
                  {detailsMessage}
                </p>
              ) : null}
              <button className="button-secondary" disabled={isSavingDetails} type="submit">
                {isSavingDetails ? "Saving publicly" : "Save publicly"}
              </button>
            </form>
          ) : null}
          <PublicMenuView identifier={menuId} showActions={false} />
        </section>
      ) : null}
    </div>
  );
}
