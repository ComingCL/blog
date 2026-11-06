// Pure URL classification shared by the server-rendered article and client previews.
// Keep this module outside the "use client" boundary.
export function isVideoURL(src: string) {
  try {
    const url = new URL(src, "https://blog.invalid");
    return (
      ["http:", "https:"].includes(url.protocol) &&
      /\.(mp4|webm|ogv|ogg|m4v|mov)$/i.test(url.pathname)
    );
  } catch {
    return false;
  }
}
