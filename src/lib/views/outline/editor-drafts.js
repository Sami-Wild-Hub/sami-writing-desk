// Unsubmitted card text is independent of the shared workspace and cloud revisions.
// Reads: localStorage <outline key>:editors (JSON)
// Writes: localStorage <outline key>:editors (JSON)
export function editorDrafts(key, warning) {
  let values = {};
  try { values = JSON.parse(localStorage.getItem(key) || '{}'); }
  catch (error) { warning(error); }
  const persist = () => {
    try { localStorage.setItem(key, JSON.stringify(Object.fromEntries(Object.entries(values).filter(([, v]) => v.text.trim())))); }
    catch (error) { warning(error); }
  };
  return {
    values,
    capture(form) {
      const id = form.dataset.draft;
      if (!id) return;
      values[id] = { text: form.elements.text.value, details: form.elements.details?.value || '' }; persist();
    },
    drop(id) { delete values[id]; persist(); },
  };
}
