const invoke = window.__TAURI__?.core?.invoke;
const STORE_KEY = 'vibepbl-browser-preview';

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
  getSession: () => invoke ? invoke('get_session') : Promise.resolve(previewRead()),
  saveField: (field, value) => invoke ? invoke('save_session_field', { fieldName: field, jsonValue: JSON.stringify(value) }) : Promise.resolve(previewWrite(toCamel(field), value)),
  resetSession: () => invoke ? invoke('reset_session') : Promise.resolve(localStorage.removeItem(STORE_KEY)),
  pickImage: () => invoke ? invoke('pick_and_import_image') : Promise.reject(new Error('Image importing is available in the installed desktop app.')),
  deleteImage: id => invoke ? invoke('delete_image', { imageId: id }) : Promise.resolve(),
  getMembers: () => invoke ? invoke('get_members') : Promise.resolve(JSON.parse(localStorage.getItem('vibepbl-members') || '[]')),
  addMember: name => invoke ? invoke('add_member', { name }) : Promise.resolve(previewAddMember(name)),
  removeMember: id => invoke ? invoke('remove_member', { id }) : Promise.resolve(previewRemoveMember(id)),
  importMembers: names => invoke ? invoke('import_members_list', { names }) : Promise.all(names.map(previewAddMember)),
  exportSavefile: () => invoke ? invoke('export_savefile_dialog') : Promise.reject(new Error('Native Save As is available in the installed desktop app.')),
  importSavefile: () => invoke ? invoke('import_savefile_dialog') : Promise.reject(new Error('Native file opening is available in the installed desktop app.')),
  getPrintData: () => invoke ? invoke('get_print_act1_data') : Promise.resolve({ session: previewRead(), generatedAt: new Date().toISOString() }),
  openPrintWindow: () => invoke ? invoke('open_print_window') : Promise.resolve(window.open('./print-act1.html', '_blank')),
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
