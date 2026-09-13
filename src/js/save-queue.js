// Snapshot at edit time; serialize writes so older requests cannot win races.
export function createSaveQueue(save, onError = () => {}, delay = 600) {
  const pending = new Map();
  const revisions = new Map();
  let timer;
  let chain = Promise.resolve();
  const drain = () => {
    clearTimeout(timer);
    const batch = [...pending];
    pending.clear();
    chain = chain.then(async () => {
      let ok = true;
      for (const [field, entry] of batch) {
        const { value, revision } = entry;
        try { await save(field, value); }
        catch (error) {
          // Do not overwrite a newer edit while retaining failed writes for retry.
          if (revisions.get(field) === revision) pending.set(field, entry);
          onError(error);
          ok = false;
        }
      }
      return ok;
    });
    return chain;
  };
  return {
    enqueue(field, value, immediate = true) {
      const revision = (revisions.get(field) || 0) + 1;
      revisions.set(field, revision);
      pending.set(field, { value:structuredClone(value), revision });
      clearTimeout(timer);
      if (immediate) return drain();
      timer = setTimeout(drain, delay);
      return Promise.resolve(true);
    },
    async flush() {
      clearTimeout(timer);
      await chain;
      if (pending.size) await drain();
      if (pending.size) throw new Error('Some changes could not be saved. Please try again.');
    }
  };
}
