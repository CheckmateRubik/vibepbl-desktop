export async function waitForPrintReady(root = document) {
  let timer;
  const assets = Promise.all([
    document.fonts?.ready,
    ...[...root.querySelectorAll('img')].map(async image => {
      // decode() rejects on missing files instead of printing an empty image silently.
      if (image.decode) await image.decode();
      else if (!image.complete) await new Promise((resolve, reject) => {
        image.addEventListener('load', resolve, { once:true });
        image.addEventListener('error', () => reject(new Error('A case image could not be loaded.')), { once:true });
      });
      if (!image.naturalWidth) throw new Error('A case image could not be loaded.');
    })
  ]);
  try {
    await Promise.race([assets, new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error('Print resources are still loading. Please try again.')), 15000);
    })]);
  } finally { clearTimeout(timer); }
}
