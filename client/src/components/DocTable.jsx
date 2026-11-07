import { useState } from 'react';
import { Eye, Download, Pencil, Share2, History, Trash2 } from 'lucide-react';
import { api, errMsg, downloadFile, fmtDate, fmtSize } from '../api.js';
import { Badge, ConfirmDialog, Empty, ErrorBox } from './ui.jsx';
import { PreviewModal, EditModal, ShareModal, HistoryModal } from './DocModals.jsx';

// Buttons shown here are only a convenience. The server re-checks every action.
export default function DocTable({ docs, onChanged, emptyText }) {
  const [preview, setPreview] = useState(null);
  const [edit, setEdit] = useState(null);
  const [share, setShare] = useState(null);
  const [history, setHistory] = useState(null);
  const [del, setDel] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function download(d) {
    setError('');
    try { await downloadFile(d); } catch (e) { setError('Download failed. You may no longer have access to this file.'); }
    onChanged();
  }

  async function remove() {
    setBusy(true);
    try {
      await api.delete(`/documents/${del.id}`);
      setDel(null);
      onChanged();
    } catch (e) {
      setError(errMsg(e));
      setDel(null);
    } finally {
      setBusy(false);
    }
  }

  if (docs.length === 0) return <Empty>{emptyText}</Empty>;

  return (
    <>
      <ErrorBox message={error} />
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr>
              <th className="th">Name</th><th className="th">Category</th><th className="th">Owner</th>
              <th className="th">Access</th><th className="th">Size</th><th className="th">Updated</th><th className="th" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {docs.map((d) => {
              const canEdit = d.access === 'OWNER' || d.access === 'EDIT';
              const isOwner = d.access === 'OWNER';
              return (
                <tr key={d.id} className="hover:bg-slate-50">
                  <td className="td">
                    <div className="font-medium">{d.title}</div>
                    <div className="text-xs text-slate-500">{d.fileName} · v{d.currentVersion}</div>
                  </td>
                  <td className="td text-slate-600">{d.category}</td>
                  <td className="td text-slate-600">{d.ownerName}</td>
                  <td className="td">
                    <Badge kind={d.access}>{d.access === 'OWNER' ? 'Owner' : d.access === 'EDIT' ? 'Can edit' : 'Can read'}</Badge>
                    {isOwner && <div className="mt-1 text-xs text-slate-500">shared with {d.sharedCount}</div>}
                    {!isOwner && d.sharedAt && <div className="mt-1 text-xs text-slate-500">since {fmtDate(d.sharedAt)}</div>}
                  </td>
                  <td className="td text-slate-600">{fmtSize(d.sizeBytes)}</td>
                  <td className="td whitespace-nowrap text-slate-600">{fmtDate(d.updatedAt)}</td>
                  <td className="td">
                    <div className="flex justify-end gap-0.5">
                      <button className="icon-btn" title="Preview" onClick={() => setPreview(d)}><Eye className="h-4 w-4" /></button>
                      <button className="icon-btn" title="Download" onClick={() => download(d)}><Download className="h-4 w-4" /></button>
                      {canEdit && <button className="icon-btn" title="Edit" onClick={() => setEdit(d)}><Pencil className="h-4 w-4" /></button>}
                      {isOwner && <button className="icon-btn" title="Share" onClick={() => setShare(d)}><Share2 className="h-4 w-4" /></button>}
                      {isOwner && <button className="icon-btn" title="History" onClick={() => setHistory(d)}><History className="h-4 w-4" /></button>}
                      {isOwner && <button className="icon-btn hover:!text-red-600" title="Delete" onClick={() => setDel(d)}><Trash2 className="h-4 w-4" /></button>}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {preview && <PreviewModal doc={preview} onClose={() => { setPreview(null); onChanged(); }} />}
      {edit && <EditModal doc={edit} onClose={() => setEdit(null)} onDone={() => { setEdit(null); onChanged(); }} />}
      {share && <ShareModal doc={share} onClose={() => setShare(null)} onChanged={onChanged} />}
      {history && <HistoryModal doc={history} onClose={() => setHistory(null)} />}
      {del && (
        <ConfirmDialog
          title="Delete this document?"
          message={`“${del.title}” and all of its versions will be permanently deleted for everyone. The deletion is recorded in the audit trail.`}
          confirmLabel="Delete permanently" danger busy={busy} onConfirm={remove} onCancel={() => setDel(null)}
        />
      )}
    </>
  );
}
