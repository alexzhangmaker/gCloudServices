// Typora Web REST API Client with Offline Resiliency
const API_BASE = '/api';

class ApiClient {
  constructor() {
    this.isOnline = navigator.onLine;
    window.addEventListener('online', () => {
      this.isOnline = true;
      this.syncPendingChanges();
    });
    window.addEventListener('offline', () => {
      this.isOnline = false;
    });
  }

  async getDocuments() {
    if (this.isOnline) {
      try {
        const res = await fetch(`${API_BASE}/documents`);
        if (res.ok) {
          const json = await res.json();
          const docs = json.data || [];
          // Cache each doc in IndexedDB for offline access
          for (const d of docs) {
            TyporaStorage.saveLocalDoc(d).catch(() => {});
          }
          return docs;
        }
      } catch (err) {
        console.warn('Network request failed, falling back to offline storage', err);
      }
    }
    // Offline fallback
    return TyporaStorage.getAllLocalDocs();
  }

  async getDocument(id) {
    if (this.isOnline) {
      try {
        const res = await fetch(`${API_BASE}/documents/${id}`);
        if (res.ok) {
          const json = await res.json();
          if (json.data) {
            await TyporaStorage.saveLocalDoc(json.data);
            return json.data;
          }
        }
      } catch (err) {
        console.warn('Network request failed for doc, using offline cache', err);
      }
    }
    return TyporaStorage.getLocalDoc(id);
  }

  async createDocument(data) {
    const id = data.id || ('doc-' + Date.now() + '-' + Math.random().toString(36).substring(2, 7));
    const now = Date.now();
    const doc = {
      id,
      title: data.title || 'Untitled Document',
      content: data.content || '',
      folder_id: data.folder_id || null,
      is_favorite: data.is_favorite ? 1 : 0,
      is_pinned: 0,
      created_at: now,
      updated_at: now
    };

    if (this.isOnline) {
      try {
        const res = await fetch(`${API_BASE}/documents`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(doc)
        });
        if (res.ok) {
          const json = await res.json();
          await TyporaStorage.saveLocalDoc(json.data);
          return json.data;
        }
      } catch (err) {
        console.warn('Offline: Saving new document to local queue', err);
      }
    }

    // Offline save & queue sync
    await TyporaStorage.saveLocalDoc(doc);
    await TyporaStorage.queuePendingSync(doc);
    return doc;
  }

  async updateDocument(id, updates) {
    // Save locally first for instant UI response
    let localDoc = await TyporaStorage.getLocalDoc(id);
    if (localDoc) {
      localDoc = { ...localDoc, ...updates, updated_at: Date.now() };
      await TyporaStorage.saveLocalDoc(localDoc);
    }

    if (this.isOnline) {
      try {
        const res = await fetch(`${API_BASE}/documents/${id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updates)
        });
        if (res.ok) {
          const json = await res.json();
          await TyporaStorage.saveLocalDoc(json.data);
          return json.data;
        }
      } catch (err) {
        console.warn('Offline: Queueing update for sync', err);
      }
    }

    // Queue for sync when offline
    if (localDoc) {
      await TyporaStorage.queuePendingSync(localDoc);
    }
    return localDoc;
  }

  async deleteDocument(id) {
    await TyporaStorage.deleteLocalDoc(id);

    if (this.isOnline) {
      try {
        const res = await fetch(`${API_BASE}/documents/${id}`, { method: 'DELETE' });
        return res.ok;
      } catch (err) {
        console.warn('Failed to delete on server', err);
      }
    }
    return true;
  }

  async duplicateDocument(id) {
    if (this.isOnline) {
      try {
        const res = await fetch(`${API_BASE}/documents/${id}/duplicate`, { method: 'POST' });
        if (res.ok) {
          const json = await res.json();
          await TyporaStorage.saveLocalDoc(json.data);
          return json.data;
        }
      } catch (e) {}
    }

    const original = await TyporaStorage.getLocalDoc(id);
    if (!original) return null;
    return this.createDocument({
      title: `${original.title} (Copy)`,
      content: original.content,
      folder_id: original.folder_id
    });
  }

  async search(query) {
    if (this.isOnline) {
      try {
        const res = await fetch(`${API_BASE}/search?q=${encodeURIComponent(query)}`);
        if (res.ok) {
          const json = await res.json();
          return json.data || [];
        }
      } catch (e) {}
    }

    // Client-side search fallback
    const all = await TyporaStorage.getAllLocalDocs();
    const qLower = query.toLowerCase();
    return all.filter(d => (d.title && d.title.toLowerCase().includes(qLower)) || (d.content && d.content.toLowerCase().includes(qLower)))
      .map(d => ({
        id: d.id,
        title: d.title,
        updated_at: d.updated_at,
        snippet: (d.content || '').substring(0, 100)
      }));
  }

  async uploadFile(file) {
    if (!this.isOnline) {
      // Offline fallback: convert to DataURL
      return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve({ url: reader.result, filename: file.name });
        reader.readAsDataURL(file);
      });
    }

    const formData = new FormData();
    formData.append('file', file);

    const res = await fetch(`${API_BASE}/upload`, {
      method: 'POST',
      body: formData
    });
    if (!res.ok) throw new Error('Upload failed');
    return res.json();
  }

  async importFile(file) {
    const formData = new FormData();
    formData.append('file', file);

    const res = await fetch(`${API_BASE}/import`, {
      method: 'POST',
      body: formData
    });
    if (!res.ok) throw new Error('Import failed');
    const json = await res.json();
    if (json.data) {
      await TyporaStorage.saveLocalDoc(json.data);
    }
    return json.data;
  }

  async getVersions(docId) {
    if (!this.isOnline) return [];
    try {
      const res = await fetch(`${API_BASE}/documents/${docId}/versions`);
      if (res.ok) {
        const json = await res.json();
        return json.data || [];
      }
    } catch (e) {}
    return [];
  }

  async restoreVersion(docId, versionId) {
    const res = await fetch(`${API_BASE}/documents/${docId}/restore/${versionId}`, { method: 'POST' });
    if (!res.ok) throw new Error('Restore failed');
    const json = await res.json();
    if (json.data) {
      await TyporaStorage.saveLocalDoc(json.data);
    }
    return json.data;
  }

  async syncPendingChanges() {
    try {
      const pending = await TyporaStorage.getPendingSyncs();
      if (!pending || pending.length === 0) return;

      console.log(`[Sync] Syncing ${pending.length} pending offline edits to SQLite...`);
      for (const item of pending) {
        const doc = item.doc;
        // Attempt update or create
        try {
          const res = await fetch(`${API_BASE}/documents/${doc.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(doc)
          });
          if (res.status === 404) {
            // Document doesn't exist on server yet, create it
            await fetch(`${API_BASE}/documents`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(doc)
            });
          }
          await TyporaStorage.clearPendingSync(doc.id);
        } catch (syncErr) {
          console.warn('Sync failed for doc', doc.id, syncErr);
        }
      }
      console.log('[Sync] Offline synchronization complete');
    } catch (err) {
      console.error('[Sync] Error syncing offline changes:', err);
    }
  }
}

window.apiClient = new ApiClient();
