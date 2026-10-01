import { ImagePlus, Loader2, X } from "lucide-react";
import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { addImage, imageFromTransfer, useImageUrl } from "@/lib/images";
import { toast } from "./toast";

/** A card image; shows a soft placeholder while it loads (or downloads from the cloud). */
export function CardImage({
  id,
  className = "",
  zoomable = false,
}: {
  id: string | null | undefined;
  className?: string;
  zoomable?: boolean;
}) {
  const url = useImageUrl(id);
  const [zoom, setZoom] = useState(false);
  if (!id) return null;
  if (!url) return <span className={`card-img loading ${className}`} aria-hidden />;
  return (
    <>
      <img
        className={`card-img ${zoomable ? "zoomable" : ""} ${className}`}
        src={url}
        alt=""
        draggable={false}
        onClick={
          zoomable
            ? (e) => {
                e.stopPropagation();
                setZoom(true);
              }
            : undefined
        }
      />
      {zoom &&
        createPortal(
          <div className="veil img-zoom" onClick={() => setZoom(false)}>
            <img src={url} alt="" />
          </div>,
          document.body,
        )}
    </>
  );
}

/** Editor slot: click to pick, drop a file, or paste into the matching text field. */
export function ImageSlot({
  value,
  onChange,
  label,
}: {
  value: string | null | undefined;
  onChange: (id: string | null) => void;
  label: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [over, setOver] = useState(false);

  const take = async (file: File | null | undefined) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) return toast("That file isn't an image");
    setBusy(true);
    try {
      onChange(await addImage(file));
    } catch (e) {
      toast(e instanceof Error ? e.message : "Couldn't add that image");
    } finally {
      setBusy(false);
    }
  };

  if (value) {
    return (
      <div className="img-slot filled">
        <CardImage id={value} zoomable />
        <button
          className="img-slot-remove"
          onClick={() => onChange(null)}
          aria-label={`Remove ${label} image`}
          title="Remove image"
        >
          <X />
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      className={`img-slot${over ? " over" : ""}`}
      onClick={() => input.current?.click()}
      onDragOver={(e) => {
        if (!Array.from(e.dataTransfer.types).includes("Files")) return;
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        void take(imageFromTransfer(e.dataTransfer));
      }}
      aria-label={`Add ${label} image`}
      title="Add image — click, drop a file, or paste into the text box"
    >
      {busy ? <Loader2 className="spin" /> : <ImagePlus />}
      <span>Image</span>
      <input
        ref={input}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          void take(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
    </button>
  );
}
