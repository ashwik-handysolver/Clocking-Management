/*
 * Screen sharing used only to take still screenshots. Nothing is recorded.
 * startScreenCapture() must be called straight from a click: browsers only show the
 * "choose what to share" prompt in response to a user action.
 */

const MAX_WIDTH = 1920;
const JPEG_QUALITY = 0.7;

export async function startScreenCapture({ onEnded }) {
  const stream = await navigator.mediaDevices.getDisplayMedia({
    video: { displaySurface: "monitor", frameRate: { ideal: 1, max: 1 } }, // whole screen; 1 frame/s is plenty for stills
    audio: false,
  });
  const track = stream.getVideoTracks()[0];
  // Chrome may treat the frame-rate hint loosely and capture the screen up to 30 times a second.
  // We only need a still every few minutes, so cap it hard at 1 frame per second.
  await track.applyConstraints({ frameRate: { max: 1 } }).catch(() => {});

  // Chrome/Edge grab frames straight from the stream (ImageCapture). Other browsers need a playing
  // video to copy frames from; it's only created there, since keeping it playing costs CPU the whole time.
  let video = null;
  const startVideo = async () => {
    if (video) return video;
    video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.srcObject = stream;
    Object.assign(video.style, { position: "fixed", left: "-10px", top: "0", width: "1px", height: "1px", opacity: "0", pointerEvents: "none" });
    document.body.appendChild(video);
    await video.play().catch(() => {});
    return video;
  };
  const canGrab = "ImageCapture" in window;
  if (!canGrab) await startVideo();

  const handleEnded = () => onEnded?.();
  track.addEventListener("ended", handleEnded);

  return {
    /** One still frame as a JPEG blob. */
    async grab() {
      let source = null;
      // ImageCapture keeps working when this tab is in the background.
      if (canGrab) {
        try {
          source = await new window.ImageCapture(track).grabFrame();
        } catch {
          /* fall back to a video element */
        }
      }
      if (!source) {
        source = await startVideo();
        if (!source.videoWidth) await new Promise((r) => setTimeout(r, 300)); // first frame
      }
      const w = source.width || source.videoWidth;
      const h = source.height || source.videoHeight;
      if (!w || !h) throw new Error("No frame available yet");
      const scale = Math.min(1, MAX_WIDTH / w);
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(w * scale);
      canvas.height = Math.round(h * scale);
      canvas.getContext("2d").drawImage(source, 0, 0, canvas.width, canvas.height);
      source.close?.(); // free the full-size frame right away
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY));
      const size = { width: canvas.width, height: canvas.height };
      canvas.width = canvas.height = 0; // release the canvas memory now, not at the next garbage collection
      if (!blob) throw new Error("Could not encode screenshot");
      return { blob, ...size };
    },
    stop() {
      track.removeEventListener("ended", handleEnded);
      stream.getTracks().forEach((t) => t.stop());
      video?.remove();
    },
  };
}
