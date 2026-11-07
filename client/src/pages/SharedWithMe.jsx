import { useCallback, useEffect, useState } from 'react';
import { api, errMsg } from '../api.js';
import { PageTitle, StatCard, Spinner, ErrorBox } from '../components/ui.jsx';
import DocTable from '../components/DocTable.jsx';

export default function SharedWithMe() {
  const [docs, setDocs] = useState(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const r = await api.get('/documents');
      setDocs(r.data.documents.filter((d) => d.access !== 'OWNER'));
      setError('');
    } catch (e) {
      setError(errMsg(e));
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  return (
    <>
      <PageTitle title="Shared with me" />
      <ErrorBox message={error} />
      <div className="mb-6 grid gap-4 sm:grid-cols-2">
        <StatCard label="Documents shared with me" value={docs ? docs.length : '…'} />
        <StatCard label="Where I can edit" value={docs ? docs.filter((d) => d.access === 'EDIT').length : '…'} />
      </div>
      <div className="card">
        {!docs ? <Spinner /> : <DocTable docs={docs} onChanged={load} emptyText="Nothing has been shared with you yet. When an owner shares a document, it appears here." />}
      </div>
    </>
  );
}
