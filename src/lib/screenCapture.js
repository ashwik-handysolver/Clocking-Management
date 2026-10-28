/*
 * Screen sharing used only to take still screenshots. Nothing is recorded.
 * startScreenCapture() must be called straight from a click: browsers only show the
 * "choose what to share" prompt in response to a user action.
 */

const MAX_WIDTH = 1920;
const JPEG_QUALITY = 0.7;

export async function startScreenCapture({ onEnded }) {
  const stream = await navigator.mediaDevices.getDisplayMedia({
    video: { displaySurface: "monitor", frameRate: 1 }, // hint: whole screen; a low frame rate is enough for stills
    audio: false,
  });
  const track = stream.getVideoTracks()[0];

  // A tiny on-page video keeps frames flowing for the canvas fallback.
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.srcObject = stream;
  Object.assign(video.style, { position: "fixed", left: "-10px", top: "0", width: "1px", height: "1px", opacity: "0", pointerEvents: "none" });
  document.body.appendChild(video);
  await video.play().catch(() => {});

  const handleEnded = () => onEnded?.();
  track.addEventListener("ended", handleEnded);

  return {
    /** One still frame as a JPEG blob. */
    async grab() {
      let source = null;
      // ImageCapture (Chrome/Edge) keeps working when this tab is in the background.
      if ("ImageCapture" in window) {
        try {
          source = await new window.ImageCapture(track).grabFrame();
        } catch {
          /* fall back to the video element */
        }
      }
      source ??= video;
      const w = source.width || video.videoWidth;
      const h = source.height || video.videoHeight;
      if (!w || !h) throw new Error("No frame available yet");
      const scale = Math.min(1, MAX_WIDTH / w);
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(w * scale);
      canvas.height = Math.round(h * scale);
      canvas.getContext("2d").drawImage(source, 0, 0, canvas.width, canvas.height);
      source.close?.();
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY));
      if (!blob) throw new Error("Could not encode screenshot");
      return { blob, width: canvas.width, height: canvas.height };
    },
    stop() {
      track.removeEventListener("ended", handleEnded);
      stream.getTracks().forEach((t) => t.stop());
      video.remove();
    },
  };
}
