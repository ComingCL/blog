for (const url of [
  "http://127.0.0.1:8080/v1/readyz",
  "http://127.0.0.1:3100/v1",
]) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(4000) });
    if (!response.ok) process.exit(1);
    await response.body?.cancel();
  } catch {
    process.exit(1);
  }
}
