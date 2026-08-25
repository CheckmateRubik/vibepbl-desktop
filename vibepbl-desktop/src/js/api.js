const invoke = window.__TAURI__?.core?.invoke;
const isPackagedApp = location.hostname === 'tauri.localhost';
const STORE_KEY = 'vibepbl-browser-preview';

function nativeOnly(message) {
  return Promise.reject(new Error(isPackagedApp && !invoke
    ? 'The native desktop bridge failed to initialize. Reinstall the latest VibePBL Desktop release.'
    : message));
}

function desktopOr(command, args, preview) {
  if (invoke) return invoke(command, args);
  if (isPackagedApp) return nativeOnly('This operation requires the native desktop bridge.');
  return Promise.resolve().then(preview);
}

export const blankSession = () => ({
  id: 1, title: 'PBL Session', theme: 'default', caseText: '', caseImages: [], terms: [], timeline: [],
  problems: [], objectives: [], presenterAssignments: {}, isAct1Completed: false, updatedAt: new Date().toISOString()
});

function previewRead() {
  try { return { ...blankSession(), ...JSON.parse(localStorage.getItem(STORE_KEY) || '{}') }; }
  catch { return blankSession(); }
}

function previewWrite(field, value) {
  const session = previewRead(); session[field] = value; session.updatedAt = new Date().toISOString();
  localStorage.setItem(STORE_KEY, JSON.stringify(session));
}

export const API = {
  isNative: Boolean(invoke),
  getSession: () => desktopOr('get_session', undefined, previewRead),
  saveField: (field, value) => desktopOr('save_session_field', { fieldName: field, jsonValue: JSON.stringify(value) }, () => previewWrite(toCamel(field), value)),
  resetSession: () => desktopOr('reset_session', undefined, () => localStorage.removeItem(STORE_KEY)),
  pickImage: () => invoke ? invoke('pick_and_import_image') : nativeOnly('Image importing is available in the installed desktop app.'),
  deleteImage: id => desktopOr('delete_image', { imageId: id }, () => undefined),
  getMembers: () => desktopOr('get_members', undefined, () => JSON.parse(localStorage.getItem('vibepbl-members') || '[]')),
  addMember: name => desktopOr('add_member', { name }, () => previewAddMember(name)),
  removeMember: id => desktopOr('remove_member', { id }, () => previewRemoveMember(id)),
  importMembers: names => desktopOr('import_members_list', { names }, () => Promise.all(names.map(previewAddMember))),
  exportSavefile: () => invoke ? invoke('export_savefile_dialog') : nativeOnly('Native Save As is available in the installed desktop app.'),
  importSavefile: () => invoke ? invoke('import_savefile_dialog') : nativeOnly('Native file opening is available in the installed desktop app.'),
  getPrintData: () => desktopOr('get_print_act1_data', undefined, () => ({ session: previewRead(), generatedAt: new Date().toISOString() })),
  openPrintWindow: () => desktopOr('open_print_window', undefined, () => window.open('./print-act1.html', '_blank')),
  imageUrl: path => window.__TAURI__?.core?.convertFileSrc ? window.__TAURI__.core.convertFileSrc(path) : path
};

function toCamel(value) { return value.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase()); }
function previewAddMember(name) {
  const members = JSON.parse(localStorage.getItem('vibepbl-members') || '[]');
  if (members.some(member => member.name.toLowerCase() === name.trim().toLowerCase())) throw new Error('That member is already in the roster');
  const member = { id: Date.now(), name: name.trim(), createdAt: new Date().toISOString() };
  members.push(member); localStorage.setItem('vibepbl-members', JSON.stringify(members)); return member;
}
function previewRemoveMember(id) {
  const members = JSON.parse(localStorage.getItem('vibepbl-members') || '[]').filter(member => member.id !== id);
  localStorage.setItem('vibepbl-members', JSON.stringify(members));
}
