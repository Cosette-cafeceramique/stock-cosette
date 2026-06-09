import { useEffect, useMemo, useState } from 'react'
import { supabase, hasSupabaseConfig } from './lib/supabase'
import {
  fullCostHT,
  marginHT,
  marginRate,
  money,
  originLabel,
  percent,
  priceHT,
  statusOf,
  toNumber,
  vatCollected
} from './lib/calculations'

const emptyItem = {
  name: '',
  category: 'Tasses',
  supplier: '',
  sku: '',
  store_reference: '',
  supplier_reference: '',
  purchase_origin: 'FR',
  stock_qty: 0,
  min_qty: 3,
  price_ttc: 0,
  sale_vat_rate: 20,
  purchase_price_ht: 0,
  purchase_vat_recoverable: 0,
  paint_cost_ht: 0.5,
  firing_cost_ht: 0.65,
  packaging_cost_ht: 0.25,
  other_fixed_cost_ht: 0.15,
  payment_fee_rate: 1.5,
  note: ''
}

const DEFAULT_SETTINGS = {
  id: 'global',
  default_category: 'Tasses',
  default_purchase_origin: 'FR',
  default_min_qty: 3,
  default_sale_vat_rate: 20,
  default_paint_cost_ht: 0.50,
  default_firing_cost_ht: 0.65,
  default_packaging_cost_ht: 0.25,
  default_other_fixed_cost_ht: 0.15,
  default_payment_fee_rate: 1.50,
  default_purchase_vat_rate: 20,
  default_supplier: '',
  low_margin_alert_rate: 55
}

function buildDefaultItem(settings = DEFAULT_SETTINGS) {
  return {
    ...emptyItem,
    category: settings.default_category || 'Tasses',
    supplier: settings.default_supplier || '',
    purchase_origin: settings.default_purchase_origin || 'FR',
    min_qty: toNumber(settings.default_min_qty, 3),
    sale_vat_rate: toNumber(settings.default_sale_vat_rate, 20),
    paint_cost_ht: toNumber(settings.default_paint_cost_ht, 0.50),
    firing_cost_ht: toNumber(settings.default_firing_cost_ht, 0.65),
    packaging_cost_ht: toNumber(settings.default_packaging_cost_ht, 0.25),
    other_fixed_cost_ht: toNumber(settings.default_other_fixed_cost_ht, 0.15),
    payment_fee_rate: toNumber(settings.default_payment_fee_rate, 1.50)
  }
}

function normalizeSettings(input) {
  return {
    id: 'global',
    default_category: String(input.default_category || 'Tasses').trim(),
    default_purchase_origin: input.default_purchase_origin || 'FR',
    default_min_qty: Math.max(0, Math.round(toNumber(input.default_min_qty, 3))),
    default_sale_vat_rate: Math.max(0, toNumber(input.default_sale_vat_rate, 20)),
    default_paint_cost_ht: Math.max(0, toNumber(input.default_paint_cost_ht, 0.50)),
    default_firing_cost_ht: Math.max(0, toNumber(input.default_firing_cost_ht, 0.65)),
    default_packaging_cost_ht: Math.max(0, toNumber(input.default_packaging_cost_ht, 0.25)),
    default_other_fixed_cost_ht: Math.max(0, toNumber(input.default_other_fixed_cost_ht, 0.15)),
    default_payment_fee_rate: Math.max(0, toNumber(input.default_payment_fee_rate, 1.50)),
    default_purchase_vat_rate: Math.max(0, toNumber(input.default_purchase_vat_rate, 20)),
    default_supplier: String(input.default_supplier || '').trim(),
    low_margin_alert_rate: Math.max(0, toNumber(input.low_margin_alert_rate, 55))
  }
}

export default function App() {
  const [session, setSession] = useState(null)
  const [member, setMember] = useState(null)
  const [authMode, setAuthMode] = useState('login')
  const [authEmail, setAuthEmail] = useState('')
  const [authPassword, setAuthPassword] = useState('')
  const [message, setMessage] = useState('')
  const [tab, setTab] = useState('dashboard')
  const [items, setItems] = useState([])
  const [movements, setMovements] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [settings, setSettings] = useState(DEFAULT_SETTINGS)
  const [settingsDraft, setSettingsDraft] = useState(DEFAULT_SETTINGS)
  const [form, setForm] = useState(() => buildDefaultItem(DEFAULT_SETTINGS))
  const [editingId, setEditingId] = useState(null)
  const [search, setSearch] = useState('')
  const [originFilter, setOriginFilter] = useState('')
  const [movementDraft, setMovementDraft] = useState({ item_id: '', type: 'sale', qty: 1, note: '' })
  const [saleDraft, setSaleDraft] = useState({ item_id: '', qty: 1, discount_ttc: 0 })
  const [clearCode, setClearCode] = useState('')

  useEffect(() => {
    if (!hasSupabaseConfig) {
      setLoading(false)
      return
    }

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setLoading(false)
    })

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession)
      setMember(null)
    })

    return () => authListener.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (session?.user) {
      loadMember()
    } else {
      setMember(null)
      setItems([])
      setMovements([])
    }
  }, [session?.user?.id])

  useEffect(() => {
    if (member) {
      loadAll()
    }
  }, [member?.user_id])

  async function loadMember() {
    setMessage('')
    const { data, error } = await supabase
      .from('app_members')
      .select('*')
      .eq('user_id', session.user.id)
      .maybeSingle()

    if (error) {
      setMessage(`Erreur accès membre : ${error.message}`)
      return
    }

    setMember(data)
    if (!data) {
      setMessage("Compte créé, mais accès Cosette non activé. Ajoute l'UUID de cet utilisateur dans la table app_members.")
    }
  }

  async function loadAll() {
    setLoading(true)
    await Promise.all([loadItems(), loadMovements(), loadSettings()])
    setLoading(false)
  }

  async function loadItems() {
    const { data, error } = await supabase
      .from('inventory_items')
      .select('*')
      .eq('active', true)
      .order('name', { ascending: true })

    if (error) {
      setMessage(error.message)
      return
    }

    setItems(data || [])
    if (!saleDraft.item_id && data?.length) {
      setSaleDraft(d => ({ ...d, item_id: data[0].id }))
    }
  }

  async function loadMovements() {
    const { data, error } = await supabase
      .from('stock_movements')
      .select('*, inventory_items(name)')
      .order('created_at', { ascending: false })
      .limit(100)

    if (error) {
      setMessage(error.message)
      return
    }

    setMovements(data || [])
  }

  async function loadSettings() {
    const { data, error } = await supabase
      .from('app_settings')
      .select('*')
      .eq('id', 'global')
      .maybeSingle()

    if (error) {
      setMessage(`Réglages non chargés : ${error.message}`)
      return
    }

    const nextSettings = data ? { ...DEFAULT_SETTINGS, ...data } : DEFAULT_SETTINGS
    setSettings(nextSettings)
    setSettingsDraft(nextSettings)
  }

  async function saveSettings(event) {
    event.preventDefault()
    setSaving(true)
    setMessage('')

    const payload = normalizeSettings(settingsDraft)
    const { error } = await supabase
      .from('app_settings')
      .upsert(payload, { onConflict: 'id' })

    setSaving(false)

    if (error) {
      setMessage(error.message)
      return
    }

    setSettings(payload)
    setSettingsDraft(payload)
    setForm(current => editingId ? current : { ...current, ...buildDefaultItem(payload), name: current.name, stock_qty: current.stock_qty, price_ttc: current.price_ttc, purchase_price_ht: current.purchase_price_ht })
    setMessage('Réglages enregistrés. Tu peux aussi les appliquer à tout l’inventaire avec le bouton prévu.')
  }

  async function applyDefaultSettingsToInventory() {
    const payload = normalizeSettings(settingsDraft)
    const confirmApply = window.confirm(
      'Appliquer ces valeurs par défaut à TOUTES les pièces actives ? Cela modifiera TVA vente, frais carte, peinture, cuisson, emballage, autres frais et seuil stock.'
    )

    if (!confirmApply) return

    setSaving(true)
    setMessage('')

    const { error: settingsError } = await supabase
      .from('app_settings')
      .upsert(payload, { onConflict: 'id' })

    if (settingsError) {
      setSaving(false)
      setMessage(settingsError.message)
      return
    }

    const { error } = await supabase
      .from('inventory_items')
      .update({
        sale_vat_rate: payload.default_sale_vat_rate,
        paint_cost_ht: payload.default_paint_cost_ht,
        firing_cost_ht: payload.default_firing_cost_ht,
        packaging_cost_ht: payload.default_packaging_cost_ht,
        other_fixed_cost_ht: payload.default_other_fixed_cost_ht,
        payment_fee_rate: payload.default_payment_fee_rate,
        min_qty: payload.default_min_qty
      })
      .eq('active', true)

    setSaving(false)

    if (error) {
      setMessage(error.message)
      return
    }

    setSettings(payload)
    setSettingsDraft(payload)
    await loadItems()
    setMessage('Réglages appliqués à toutes les pièces actives.')
  }

  async function recalculateRecoverableVatForInventory() {
    const payload = normalizeSettings(settingsDraft)
    const confirmApply = window.confirm(
      'Recalculer la TVA achat récupérable de toutes les pièces ? Pour les achats UE, elle sera mise à 0. Pour les autres, elle sera calculée avec le taux TVA achat par défaut.'
    )

    if (!confirmApply) return

    setSaving(true)
    setMessage('')

    const updates = items.map(item => {
      const nextVat = item.purchase_origin === 'UE'
        ? 0
        : toNumber(item.purchase_price_ht) * (payload.default_purchase_vat_rate / 100)

      return supabase
        .from('inventory_items')
        .update({ purchase_vat_recoverable: Number(nextVat.toFixed(2)) })
        .eq('id', item.id)
    })

    const results = await Promise.all(updates)
    const error = results.find(result => result.error)?.error
    setSaving(false)

    if (error) {
      setMessage(error.message)
      return
    }

    await loadItems()
    setMessage('TVA achat récupérable recalculée sur tout l’inventaire.')
  }

  async function handleAuth(event) {
    event.preventDefault()
    setMessage('')
    setSaving(true)

    const payload = { email: authEmail, password: authPassword }
    const result = authMode === 'login'
      ? await supabase.auth.signInWithPassword(payload)
      : await supabase.auth.signUp(payload)

    setSaving(false)

    if (result.error) {
      setMessage(result.error.message)
      return
    }

    if (authMode === 'signup') {
      setMessage("Compte créé. Selon les réglages Supabase, tu devras peut-être confirmer l’email puis ajouter l’utilisateur dans app_members.")
    }
  }

  async function signOut() {
    await supabase.auth.signOut()
  }

  function startCreate() {
    setEditingId(null)
    setForm(buildDefaultItem(settings))
    setTab('edit')
  }

  function startEdit(item) {
    setEditingId(item.id)
    setForm({ ...item })
    setTab('edit')
  }

  async function saveItem(event) {
    event.preventDefault()
    setSaving(true)
    setMessage('')

    const payload = normalizeItem(form)

    let result
    if (editingId) {
      result = await supabase
        .from('inventory_items')
        .update(payload)
        .eq('id', editingId)
    } else {
      result = await supabase
        .from('inventory_items')
        .insert(payload)
    }

    setSaving(false)

    if (result.error) {
      setMessage(result.error.message)
      return
    }

    setForm(buildDefaultItem(settings))
    setEditingId(null)
    setTab('inventory')
    await loadItems()
  }

  async function deleteItem(item) {
    if (!confirm(`Supprimer ${item.name} ?`)) return

    const { error } = await supabase
      .from('inventory_items')
      .update({ active: false })
      .eq('id', item.id)

    if (error) {
      setMessage(error.message)
      return
    }

    await loadItems()
  }

  async function recordMovement(event) {
    event.preventDefault()
    setSaving(true)
    setMessage('')

    const { error } = await supabase.rpc('record_stock_movement', {
      p_item_id: movementDraft.item_id,
      p_type: movementDraft.type,
      p_qty: toNumber(movementDraft.qty, 1),
      p_note: movementDraft.note || ''
    })

    setSaving(false)

    if (error) {
      setMessage(error.message)
      return
    }

    setMovementDraft({ item_id: '', type: 'sale', qty: 1, note: '' })
    await loadAll()
  }

  async function clearInventory() {
    setMessage('')

    if (clearCode !== 'SUPPRIMER') {
      setMessage('Code incorrect. Pour vider tout l’inventaire, tape exactement : SUPPRIMER')
      return
    }

    const confirmDelete = window.confirm(
      'Attention : cela va supprimer TOUT l’inventaire et l’historique des mouvements. Cette action est définitive. Continuer ?'
    )

    if (!confirmDelete) return

    setSaving(true)
    const { data, error } = await supabase.rpc('clear_inventory', {
      p_code: clearCode
    })
    setSaving(false)

    if (error) {
      setMessage(error.message)
      return
    }

    setClearCode('')
    setMessage(`Inventaire vidé : ${data?.items_deleted || 0} pièce(s) supprimée(s), ${data?.movements_deleted || 0} mouvement(s) supprimé(s).`)
    await loadAll()
    setTab('inventory')
  }


  const filteredItems = useMemo(() => {
    const q = search.trim().toLowerCase()
    return items.filter(item => {
      const hay = `${item.name} ${item.category} ${item.supplier} ${item.sku} ${item.store_reference || ''} ${item.supplier_reference || ''} ${item.note || ''}`.toLowerCase()
      return (!q || hay.includes(q)) && (!originFilter || item.purchase_origin === originFilter)
    })
  }, [items, search, originFilter])


  function exportInventoryCSV() {
    const rows = [
      [
        'Nom',
        'Catégorie',
        'Fournisseur',
        'Réf magasin',
        'Réf fournisseur',
        'Origine achat',
        'Stock',
        'Seuil alerte',
        'Prix TTC',
        'Prix HT',
        'TVA vente',
        'Achat HT',
        'TVA achat récupérable',
        'Peinture HT',
        'Cuisson HT',
        'Emballage HT',
        'Autres frais HT',
        'Frais paiement %',
        'Coût HT complet',
        'Marge HT',
        'Marge %',
        'Note'
      ],
      ...filteredItems.map(item => [
        item.name,
        item.category,
        item.supplier,
        item.store_reference || '',
        item.supplier_reference || '',
        originLabel(item.purchase_origin),
        item.stock_qty,
        item.min_qty,
        toNumber(item.price_ttc).toFixed(2),
        priceHT(item).toFixed(2),
        vatCollected(item).toFixed(2),
        toNumber(item.purchase_price_ht).toFixed(2),
        toNumber(item.purchase_vat_recoverable).toFixed(2),
        toNumber(item.paint_cost_ht).toFixed(2),
        toNumber(item.firing_cost_ht).toFixed(2),
        toNumber(item.packaging_cost_ht).toFixed(2),
        toNumber(item.other_fixed_cost_ht).toFixed(2),
        toNumber(item.payment_fee_rate).toFixed(2),
        fullCostHT(item).toFixed(2),
        marginHT(item).toFixed(2),
        marginRate(item).toFixed(1),
        item.note || ''
      ])
    ]

    const csv = rows
      .map(row => row.map(cell => `"${String(cell).replaceAll('"', '""')}"`).join(';'))
      .join('\n')

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `cosette-inventaire-${new Date().toISOString().slice(0, 10)}.csv`
    link.click()
    URL.revokeObjectURL(url)
  }

  const stats = useMemo(() => {
    return items.reduce((acc, item) => {
      const qty = toNumber(item.stock_qty)
      acc.caTTC += toNumber(item.price_ttc) * qty
      acc.caHT += priceHT(item) * qty
      acc.vatCollected += vatCollected(item) * qty
      acc.vatRecoverable += toNumber(item.purchase_vat_recoverable) * qty
      acc.stockPurchaseHT += toNumber(item.purchase_price_ht) * qty
      acc.stockFullCostHT += fullCostHT(item) * qty
      acc.marginHT += marginHT(item) * qty
      acc.stockQty += qty
      if (statusOf(item).label !== 'OK') acc.alerts += 1
      if (statusOf(item).label === 'Rupture') acc.ruptures += 1
      return acc
    }, {
      caTTC: 0,
      caHT: 0,
      vatCollected: 0,
      vatRecoverable: 0,
      stockPurchaseHT: 0,
      stockFullCostHT: 0,
      marginHT: 0,
      stockQty: 0,
      alerts: 0,
      ruptures: 0
    })
  }, [items])

  const saleItem = items.find(item => item.id === saleDraft.item_id) || items[0]
  const saleCalc = useMemo(() => {
    if (!saleItem) return null
    const qty = Math.max(1, toNumber(saleDraft.qty, 1))
    const discount = Math.max(0, toNumber(saleDraft.discount_ttc, 0))
    const ttcUnit = Math.max(0, toNumber(saleItem.price_ttc) - discount / qty)
    const totalTTC = ttcUnit * qty
    const totalHT = priceHT(saleItem, ttcUnit) * qty
    const totalVat = vatCollected(saleItem, ttcUnit) * qty
    const totalCost = fullCostHT(saleItem, ttcUnit) * qty
    const totalMargin = totalHT - totalCost
    return {
      totalTTC,
      totalHT,
      totalVat,
      totalCost,
      totalMargin,
      marginRate: totalHT ? totalMargin / totalHT * 100 : 0
    }
  }, [saleItem, saleDraft])

  if (!hasSupabaseConfig) {
    return <ConfigMissing />
  }

  if (loading) {
    return <div className="loading">Chargement de Cosette…</div>
  }

  if (!session) {
    return (
      <AuthView
        authMode={authMode}
        setAuthMode={setAuthMode}
        email={authEmail}
        setEmail={setAuthEmail}
        password={authPassword}
        setPassword={setAuthPassword}
        message={message}
        saving={saving}
        onSubmit={handleAuth}
      />
    )
  }

  if (!member) {
    return (
      <AccessPending
        session={session}
        message={message}
        signOut={signOut}
        reload={loadMember}
      />
    )
  }

  return (
    <div className="app">
      <header className="hero">
        <div className="topbar">
          <div className="brand">
            <div className="logo">☕</div>
            <div>
              <h1>Cosette — Inventaire & Marges</h1>
              <p className="subtitle">Stock, TVA simple, frais fixes et marge HT réelle.</p>
            </div>
          </div>
          <button onClick={signOut}>Déconnexion</button>
        </div>

        <nav className="tabs">
          {[
            ['dashboard', 'Dashboard'],
            ['inventory', 'Inventaire'],
            ['movements', 'Mouvements'],
            ['sale', 'Simulation vente'],
            ['settings', 'Réglages'],
            ['admin', 'Admin'],
            ['edit', editingId ? 'Modifier' : 'Ajouter']
          ].map(([id, label]) => (
            <button
              key={id}
              className={`tab ${tab === id ? 'active' : ''}`}
              onClick={() => id === 'edit' && !editingId ? startCreate() : setTab(id)}
            >
              {label}
            </button>
          ))}
        </nav>
      </header>

      {message && <div className="message">{message}</div>}

      {tab === 'dashboard' && (
        <Dashboard stats={stats} items={items} movements={movements} settings={settings} />
      )}

      {tab === 'inventory' && (
        <Inventory
          items={filteredItems}
          search={search}
          setSearch={setSearch}
          originFilter={originFilter}
          setOriginFilter={setOriginFilter}
          startCreate={startCreate}
          startEdit={startEdit}
          deleteItem={deleteItem}
          setMovementDraft={setMovementDraft}
          setTab={setTab}
          exportInventoryCSV={exportInventoryCSV}
        />
      )}

      {tab === 'movements' && (
        <Movements
          items={items}
          movements={movements}
          draft={movementDraft}
          setDraft={setMovementDraft}
          onSubmit={recordMovement}
          saving={saving}
        />
      )}

      {tab === 'sale' && (
        <SaleSimulator
          items={items}
          draft={saleDraft}
          setDraft={setSaleDraft}
          calc={saleCalc}
        />
      )}

      {tab === 'settings' && (
        <SettingsPanel
          settingsDraft={settingsDraft}
          setSettingsDraft={setSettingsDraft}
          saveSettings={saveSettings}
          applyDefaultSettingsToInventory={applyDefaultSettingsToInventory}
          recalculateRecoverableVatForInventory={recalculateRecoverableVatForInventory}
          saving={saving}
        />
      )}

      {tab === 'admin' && (
        <AdminPanel
          stats={stats}
          items={items}
          clearCode={clearCode}
          setClearCode={setClearCode}
          clearInventory={clearInventory}
          saving={saving}
          exportInventoryCSV={exportInventoryCSV}
        />
      )}

      {tab === 'edit' && (
        <ItemForm
          form={form}
          setForm={setForm}
          editingId={editingId}
          saveItem={saveItem}
          saving={saving}
          cancel={() => {
            setEditingId(null)
            setForm(buildDefaultItem(settings))
            setTab('inventory')
          }}
        />
      )}
    </div>
  )
}

function normalizeItem(input) {
  return {
    name: String(input.name || '').trim(),
    category: String(input.category || 'Autre').trim(),
    supplier: String(input.supplier || '').trim(),
    sku: String(input.sku || '').trim(),
    store_reference: String(input.store_reference || '').trim(),
    supplier_reference: String(input.supplier_reference || '').trim(),
    purchase_origin: input.purchase_origin || 'FR',
    stock_qty: Math.max(0, Math.round(toNumber(input.stock_qty))),
    min_qty: Math.max(0, Math.round(toNumber(input.min_qty))),
    price_ttc: Math.max(0, toNumber(input.price_ttc)),
    sale_vat_rate: Math.max(0, toNumber(input.sale_vat_rate, 20)),
    purchase_price_ht: Math.max(0, toNumber(input.purchase_price_ht)),
    purchase_vat_recoverable: Math.max(0, toNumber(input.purchase_vat_recoverable)),
    paint_cost_ht: Math.max(0, toNumber(input.paint_cost_ht)),
    firing_cost_ht: Math.max(0, toNumber(input.firing_cost_ht)),
    packaging_cost_ht: Math.max(0, toNumber(input.packaging_cost_ht)),
    other_fixed_cost_ht: Math.max(0, toNumber(input.other_fixed_cost_ht)),
    payment_fee_rate: Math.max(0, toNumber(input.payment_fee_rate)),
    note: String(input.note || '').trim()
  }
}

function ConfigMissing() {
  return (
    <main className="auth-wrap">
      <section className="auth-card">
        <div className="brand">
          <div className="logo">☕</div>
          <div>
            <h1>Cosette</h1>
            <p className="subtitle">Configuration manquante</p>
          </div>
        </div>
        <div className="message">
          Ajoute un fichier <strong>.env</strong> avec <code>VITE_SUPABASE_URL</code> et <code>VITE_SUPABASE_ANON_KEY</code>.
        </div>
      </section>
    </main>
  )
}

function AuthView({ authMode, setAuthMode, email, setEmail, password, setPassword, message, saving, onSubmit }) {
  return (
    <main className="auth-wrap">
      <section className="auth-card">
        <div className="brand">
          <div className="logo">☕</div>
          <div>
            <h1>Cosette</h1>
            <p className="subtitle">Inventaire & marges</p>
          </div>
        </div>

        {message && <div className="message">{message}</div>}

        <form onSubmit={onSubmit} className="auth-form">
          <label>Email</label>
          <input type="email" value={email} onChange={e => setEmail(e.target.value)} required />

          <label>Mot de passe</label>
          <input type="password" value={password} onChange={e => setPassword(e.target.value)} required minLength={8} />

          <button className="primary" disabled={saving}>
            {saving ? 'Chargement…' : authMode === 'login' ? 'Se connecter' : 'Créer mon compte'}
          </button>
        </form>

        <button className="link-btn" onClick={() => setAuthMode(authMode === 'login' ? 'signup' : 'login')}>
          {authMode === 'login' ? 'Créer un compte' : 'J’ai déjà un compte'}
        </button>
      </section>
    </main>
  )
}

function AccessPending({ session, message, signOut, reload }) {
  return (
    <main className="auth-wrap">
      <section className="auth-card">
        <div className="brand">
          <div className="logo">☕</div>
          <div>
            <h1>Accès en attente</h1>
            <p className="subtitle">{session.user.email}</p>
          </div>
        </div>

        {message && <div className="message">{message}</div>}

        <div className="note-box">
          <p>Copie cet UUID dans Supabase, table <strong>app_members</strong>, colonne <strong>user_id</strong> :</p>
          <code>{session.user.id}</code>
        </div>

        <div className="button-row">
          <button onClick={reload}>Réessayer</button>
          <button onClick={signOut}>Déconnexion</button>
        </div>
      </section>
    </main>
  )
}

function Dashboard({ stats, items, movements, settings }) {
  const alertItems = items.filter(item => statusOf(item).label !== 'OK')
  const topMargins = [...items].sort((a, b) => marginHT(b) - marginHT(a)).slice(0, 8)
  const lowMargins = items.filter(item => marginRate(item) < toNumber(settings.low_margin_alert_rate, 55)).slice(0, 8)

  return (
    <>
      <section className="grid stats-grid">
        <Stat label="CA TTC potentiel" value={money(stats.caTTC)} />
        <Stat label="CA HT réel" value={money(stats.caHT)} />
        <Stat label="TVA collectée" value={money(stats.vatCollected)} />
        <Stat label="TVA achats récup." value={money(stats.vatRecoverable)} />
        <Stat label="TVA nette estimée" value={money(stats.vatCollected - stats.vatRecoverable)} />
        <Stat label="Stock immobilisé achat HT" value={money(stats.stockPurchaseHT)} />
        <Stat label="Coût complet potentiel" value={money(stats.stockFullCostHT)} />
        <Stat label="Marge HT réelle" value={money(stats.marginHT)} />
        <Stat label="Pièces en stock" value={stats.stockQty} />
        <Stat label="Alertes" value={stats.alerts} />
      </section>

      <section className="panel insight-panel">
        <div className="panel-head">
          <div>
            <h2>Lecture rapide</h2>
            <p className="hint">Le stock immobilisé achat HT correspond à l’argent bloqué dans les pièces brutes. Le coût complet potentiel ajoute les frais futurs estimés : peinture, cuisson, emballage et paiement.</p>
          </div>
        </div>
        <div className="dashboard-insights">
          <div><span>Argent bloqué en achat HT</span><strong>{money(stats.stockPurchaseHT)}</strong></div>
          <div><span>Coûts fixes futurs estimés</span><strong>{money(stats.stockFullCostHT - stats.stockPurchaseHT)}</strong></div>
          <div><span>Marge potentielle après coûts</span><strong>{money(stats.marginHT)}</strong></div>
        </div>
      </section>

      <section className="two-cols">
        <div className="panel">
          <div className="panel-head">
            <div>
              <h2>À surveiller</h2>
              <p className="hint">Pièces sous le seuil d’alerte ou en rupture.</p>
            </div>
          </div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Pièce</th><th>Stock</th><th>Statut</th></tr></thead>
              <tbody>
              {alertItems.length ? alertItems.map(item => {
                const st = statusOf(item)
                return (
                  <tr key={item.id}>
                    <td><strong>{item.name}</strong><br/><span className="hint">{item.category}</span></td>
                    <td>{item.stock_qty} / seuil {item.min_qty}</td>
                    <td><span className={`pill ${st.className}`}>{st.label}</span></td>
                  </tr>
                )
              }) : (
                <tr><td colSpan="3" className="hint">Aucune alerte pour le moment 🌸</td></tr>
              )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="panel">
          <div className="panel-head">
            <div>
              <h2>Top marges</h2>
              <p className="hint">Marge HT réelle après frais fixes.</p>
            </div>
          </div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Pièce</th><th>Prix TTC</th><th>Marge HT</th><th>Taux</th></tr></thead>
              <tbody>
                {topMargins.map(item => (
                  <tr key={item.id}>
                    <td><strong>{item.name}</strong></td>
                    <td>{money(item.price_ttc)}</td>
                    <td><strong>{money(marginHT(item))}</strong></td>
                    <td>{percent(marginRate(item))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {lowMargins.length > 0 && (
        <section className="panel">
          <div className="panel-head">
            <div>
              <h2>Marges faibles à vérifier</h2>
              <p className="hint">Pièces sous le seuil défini dans Réglages.</p>
            </div>
          </div>
          <div className="inventory-cards desktop-cards">
            {lowMargins.map(item => (
              <div className="item-card" key={item.id}>
                <strong>{item.name}</strong>
                <span>{item.category} · marge {percent(marginRate(item))}</span>
                <small>Prix {money(item.price_ttc)} · marge HT {money(marginHT(item))}</small>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="panel">
        <div className="panel-head">
          <div>
            <h2>Derniers mouvements</h2>
            <p className="hint">Historique récent du stock.</p>
          </div>
        </div>
        <MovementList movements={movements.slice(0, 8)} />
      </section>
    </>
  )
}

function Stat({ label, value }) {
  return (
    <div className="stat">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

function Inventory({ items, search, setSearch, originFilter, setOriginFilter, startCreate, startEdit, deleteItem, setMovementDraft, setTab, exportInventoryCSV }) {
  return (
    <section className="panel">
      <div className="panel-head">
        <div>
          <h2>Inventaire</h2>
          <p className="hint">Prix TTC, TVA, frais fixes, marge HT et alertes de stock.</p>
        </div>
        <div className="toolbar">
          <input placeholder="Rechercher…" value={search} onChange={e => setSearch(e.target.value)} />
          <select value={originFilter} onChange={e => setOriginFilter(e.target.value)}>
            <option value="">Toutes origines</option>
            <option value="FR">France</option>
            <option value="UE">UE fournisseur HT</option>
            <option value="HORS_UE">Hors UE</option>
          </select>
          <button onClick={exportInventoryCSV}>Exporter CSV</button>
          <button className="primary" onClick={startCreate}>+ Ajouter</button>
        </div>
      </div>

      <div className="table-wrap">
        <table className="wide">
          <thead>
            <tr>
              <th>Pièce</th><th>Réf magasin</th><th>Réf fournisseur</th><th>Origine</th><th>Stock</th><th>Prix TTC</th><th>Prix HT</th>
              <th>TVA vente</th><th>Achat HT</th><th>TVA achat récup.</th><th>Frais fixes</th>
              <th>Coût HT complet</th><th>Marge HT</th><th>Marge %</th><th>Statut</th><th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {items.length ? items.map(item => {
              const st = statusOf(item)
              return (
                <tr key={item.id}>
                  <td><strong>{item.name}</strong><br/><span className="hint">{item.category}</span></td>
                  <td>{item.store_reference || '-'}</td>
                  <td>{item.supplier_reference || '-'}</td>
                  <td><span className="pill info">{originLabel(item.purchase_origin)}</span></td>
                  <td>{item.stock_qty} / seuil {item.min_qty}</td>
                  <td><strong>{money(item.price_ttc)}</strong></td>
                  <td>{money(priceHT(item))}</td>
                  <td>{money(vatCollected(item))}</td>
                  <td>{money(item.purchase_price_ht)}</td>
                  <td>{money(item.purchase_vat_recoverable)}</td>
                  <td>{money(fullCostHT(item) - toNumber(item.purchase_price_ht))}</td>
                  <td><strong>{money(fullCostHT(item))}</strong></td>
                  <td><strong>{money(marginHT(item))}</strong></td>
                  <td>{percent(marginRate(item))}</td>
                  <td><span className={`pill ${st.className}`}>{st.label}</span></td>
                  <td>
                    <div className="actions">
                      <button className="mini" onClick={() => {
                        setMovementDraft({ item_id: item.id, type: 'sale', qty: 1, note: '' })
                        setTab('movements')
                      }}>- stock</button>
                      <button className="mini" onClick={() => {
                        setMovementDraft({ item_id: item.id, type: 'purchase', qty: 1, note: '' })
                        setTab('movements')
                      }}>+ stock</button>
                      <button className="mini soft" onClick={() => startEdit(item)}>Modifier</button>
                      <button className="mini danger" onClick={() => deleteItem(item)}>Suppr.</button>
                    </div>
                  </td>
                </tr>
              )
            }) : (
              <tr><td colSpan="16" className="hint">Aucune pièce pour le moment.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="inventory-cards">
        {items.length ? items.map(item => {
          const st = statusOf(item)
          return (
            <article className="item-card" key={`mobile-${item.id}`}>
              <div className="item-card-head">
                <div>
                  <strong>{item.name}</strong>
                  <span>{item.category}</span>
                </div>
                <span className={`pill ${st.className}`}>{st.label}</span>
              </div>
              <div className="item-card-grid">
                <span>Stock <b>{item.stock_qty}</b></span>
                <span>Prix <b>{money(item.price_ttc)}</b></span>
                <span>Réf magasin <b>{item.store_reference || '-'}</b></span>
                <span>Réf fournisseur <b>{item.supplier_reference || '-'}</b></span>
                <span>Marge HT <b>{money(marginHT(item))}</b></span>
                <span>Marge <b>{percent(marginRate(item))}</b></span>
              </div>
              <div className="actions mobile-actions">
                <button className="mini" onClick={() => {
                  setMovementDraft({ item_id: item.id, type: 'sale', qty: 1, note: '' })
                  setTab('movements')
                }}>- stock</button>
                <button className="mini" onClick={() => {
                  setMovementDraft({ item_id: item.id, type: 'purchase', qty: 1, note: '' })
                  setTab('movements')
                }}>+ stock</button>
                <button className="mini soft" onClick={() => startEdit(item)}>Modifier</button>
              </div>
            </article>
          )
        }) : <p className="hint">Aucune pièce pour le moment.</p>}
      </div>
    </section>
  )
}

function Movements({ items, movements, draft, setDraft, onSubmit, saving }) {
  return (
    <section className="two-cols">
      <div className="panel">
        <div className="panel-head">
          <div>
            <h2>Ajouter un mouvement</h2>
            <p className="hint">Vente, réassort, casse ou ajustement.</p>
          </div>
        </div>

        <form className="form-grid compact" onSubmit={onSubmit}>
          <div>
            <label>Pièce</label>
            <select value={draft.item_id} onChange={e => setDraft({ ...draft, item_id: e.target.value })} required>
              <option value="">Choisir une pièce</option>
              {items.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          </div>

          <div>
            <label>Type</label>
            <select value={draft.type} onChange={e => setDraft({ ...draft, type: e.target.value })}>
              <option value="sale">Vente / pièce utilisée</option>
              <option value="purchase">Réassort / achat</option>
              <option value="loss">Perte / casse</option>
              <option value="adjust_plus">Ajustement +</option>
              <option value="adjust_minus">Ajustement -</option>
            </select>
          </div>

          <div>
            <label>Quantité</label>
            <input type="number" min="1" step="1" value={draft.qty} onChange={e => setDraft({ ...draft, qty: e.target.value })} />
          </div>

          <div>
            <label>Note</label>
            <input value={draft.note} onChange={e => setDraft({ ...draft, note: e.target.value })} placeholder="Optionnel" />
          </div>

          <button className="primary" disabled={saving}>{saving ? 'Enregistrement…' : 'Valider'}</button>
        </form>
      </div>

      <div className="panel">
        <div className="panel-head">
          <div>
            <h2>Historique</h2>
            <p className="hint">Les 100 derniers mouvements.</p>
          </div>
        </div>
        <MovementList movements={movements} />
      </div>
    </section>
  )
}

function MovementList({ movements }) {
  if (!movements.length) {
    return <p className="hint">Aucun mouvement pour le moment.</p>
  }

  return (
    <div className="movement-list">
      {movements.map(m => (
        <div className="movement" key={m.id}>
          <strong>{m.inventory_items?.name || 'Pièce'} — {movementLabel(m.type)} x{m.qty}</strong>
          <span>{new Date(m.created_at).toLocaleString('fr-FR')} · stock {m.before_qty} → {m.after_qty}{m.note ? ` · ${m.note}` : ''}</span>
        </div>
      ))}
    </div>
  )
}

function movementLabel(type) {
  return {
    purchase: 'Réassort',
    sale: 'Vente',
    loss: 'Casse/perte',
    adjust_plus: 'Ajustement +',
    adjust_minus: 'Ajustement -'
  }[type] || type
}

function SaleSimulator({ items, draft, setDraft, calc }) {
  return (
    <section className="panel">
      <div className="panel-head">
        <div>
          <h2>Simulation vente / atelier</h2>
          <p className="hint">Calcule le TTC, HT, TVA et la marge réelle avant de fixer un prix.</p>
        </div>
      </div>

      <div className="form-grid">
        <div>
          <label>Pièce</label>
          <select value={draft.item_id} onChange={e => setDraft({ ...draft, item_id: e.target.value })}>
            {items.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
        </div>
        <div>
          <label>Quantité</label>
          <input type="number" min="1" value={draft.qty} onChange={e => setDraft({ ...draft, qty: e.target.value })} />
        </div>
        <div>
          <label>Remise TTC totale</label>
          <input type="number" min="0" step="0.01" value={draft.discount_ttc} onChange={e => setDraft({ ...draft, discount_ttc: e.target.value })} />
        </div>
      </div>

      {calc && (
        <div className="grid stats-grid">
          <Stat label="Total TTC" value={money(calc.totalTTC)} />
          <Stat label="Total HT" value={money(calc.totalHT)} />
          <Stat label="TVA collectée" value={money(calc.totalVat)} />
          <Stat label="Coût HT complet" value={money(calc.totalCost)} />
          <Stat label="Marge HT" value={money(calc.totalMargin)} />
          <Stat label="Marge %" value={percent(calc.marginRate)} />
        </div>
      )}
    </section>
  )
}



function SettingsPanel({ settingsDraft, setSettingsDraft, saveSettings, applyDefaultSettingsToInventory, recalculateRecoverableVatForInventory, saving }) {
  function update(field, value) {
    setSettingsDraft({ ...settingsDraft, [field]: value })
  }

  return (
    <section className="panel">
      <div className="panel-head">
        <div>
          <h2>Réglages par défaut</h2>
          <p className="hint">Ces valeurs peuvent servir aux nouvelles pièces, ou être appliquées en masse aux pièces déjà existantes.</p>
        </div>
      </div>

      <form onSubmit={saveSettings}>
        <div className="form-grid">
          <Field label="Catégorie par défaut" value={settingsDraft.default_category} onChange={v => update('default_category', v)} />
          <div>
            <label>Origine achat par défaut</label>
            <select value={settingsDraft.default_purchase_origin} onChange={e => update('default_purchase_origin', e.target.value)}>
              <option value="FR">France</option>
              <option value="UE">UE fournisseur HT</option>
              <option value="HORS_UE">Hors UE</option>
            </select>
          </div>
          <Field label="Seuil stock par défaut" type="number" value={settingsDraft.default_min_qty} onChange={v => update('default_min_qty', v)} />
          <Field label="TVA vente par défaut %" type="number" step="0.01" value={settingsDraft.default_sale_vat_rate} onChange={v => update('default_sale_vat_rate', v)} />
          <Field label="Peinture HT / pièce" type="number" step="0.01" value={settingsDraft.default_paint_cost_ht} onChange={v => update('default_paint_cost_ht', v)} />
          <Field label="Cuisson HT / pièce" type="number" step="0.01" value={settingsDraft.default_firing_cost_ht} onChange={v => update('default_firing_cost_ht', v)} />
          <Field label="Emballage HT / pièce" type="number" step="0.01" value={settingsDraft.default_packaging_cost_ht} onChange={v => update('default_packaging_cost_ht', v)} />
          <Field label="Autres frais HT / pièce" type="number" step="0.01" value={settingsDraft.default_other_fixed_cost_ht} onChange={v => update('default_other_fixed_cost_ht', v)} />
          <Field label="Frais carte bancaire %" type="number" step="0.01" value={settingsDraft.default_payment_fee_rate} onChange={v => update('default_payment_fee_rate', v)} />
          <Field label="TVA achat par défaut %" type="number" step="0.01" value={settingsDraft.default_purchase_vat_rate} onChange={v => update('default_purchase_vat_rate', v)} />
          <Field label="Fournisseur par défaut" value={settingsDraft.default_supplier} onChange={v => update('default_supplier', v)} />
          <Field label="Alerte marge faible %" type="number" step="1" value={settingsDraft.low_margin_alert_rate} onChange={v => update('low_margin_alert_rate', v)} />
        </div>

        <div className="preview-box">
          <span>Exemple d’impact</span>
          <strong>{toNumber(settingsDraft.default_payment_fee_rate).toFixed(2).replace('.', ',')} %</strong>
          <small>Sur 25 € TTC, les frais carte estimés seraient de {money(25 * toNumber(settingsDraft.default_payment_fee_rate) / 100)}.</small>
        </div>

        <div className="button-row settings-actions">
          <button className="primary" disabled={saving}>{saving ? 'Enregistrement…' : 'Enregistrer les réglages'}</button>
          <button type="button" className="soft" disabled={saving} onClick={applyDefaultSettingsToInventory}>Appliquer à tout l’inventaire</button>
          <button type="button" disabled={saving} onClick={recalculateRecoverableVatForInventory}>Recalculer TVA achat</button>
        </div>

        <div className="note-box settings-help">
          <strong>Important</strong>
          <span>“Enregistrer” modifie les valeurs utilisées pour les prochaines pièces. “Appliquer à tout l’inventaire” modifie aussi les pièces déjà créées.</span>
        </div>
      </form>
    </section>
  )
}

function AdminPanel({ stats, items, clearCode, setClearCode, clearInventory, saving, exportInventoryCSV }) {
  return (
    <section className="two-cols">
      <div className="panel">
        <div className="panel-head">
          <div>
            <h2>Outils admin</h2>
            <p className="hint">Export, nettoyage et maintenance de l’inventaire Cosette.</p>
          </div>
        </div>

        <div className="admin-grid">
          <div className="note-box">
            <strong>{items.length}</strong>
            <span>pièce(s) dans l’inventaire</span>
          </div>
          <div className="note-box">
            <strong>{money(stats.caTTC)}</strong>
            <span>CA TTC potentiel</span>
          </div>
          <div className="note-box">
            <strong>{money(stats.marginHT)}</strong>
            <span>marge HT réelle potentielle</span>
          </div>
        </div>

        <div className="button-row">
          <button onClick={exportInventoryCSV}>Exporter l’inventaire CSV</button>
        </div>

        <div className="note-box">
          <h3>Pour intégrer ton stock en photo</h3>
          <p>
            Envoie-moi les photos de ton stock, surtout les colonnes avec le nom, le stock,
            la réf magasin et la réf fournisseur. Je te préparerai ensuite un fichier SQL ou CSV propre
            à importer directement dans Supabase.
          </p>
        </div>
      </div>

      <div className="panel danger-zone">
        <div className="panel-head">
          <div>
            <h2>Zone dangereuse</h2>
            <p className="hint">À utiliser seulement pour repartir de zéro avant d’importer ton vrai stock.</p>
          </div>
        </div>

        <div className="message danger-message">
          Cette action supprime tout l’inventaire et tout l’historique des mouvements. Elle est définitive.
        </div>

        <label>Code de validation</label>
        <input
          value={clearCode}
          onChange={e => setClearCode(e.target.value)}
          placeholder="Tape SUPPRIMER"
        />

        <button className="danger hard-danger" onClick={clearInventory} disabled={saving}>
          {saving ? 'Suppression…' : 'Supprimer tout l’inventaire'}
        </button>
      </div>
    </section>
  )
}


function ItemForm({ form, setForm, editingId, saveItem, saving, cancel }) {
  const previewItem = normalizeItem(form)

  function update(field, value) {
    setForm({ ...form, [field]: value })
  }

  return (
    <section className="panel">
      <div className="panel-head">
        <div>
          <h2>{editingId ? 'Modifier une pièce' : 'Ajouter une pièce'}</h2>
          <p className="hint">Tous les calculs de TVA et marge partent de ces champs.</p>
        </div>
        <button onClick={cancel}>Annuler</button>
      </div>

      <form onSubmit={saveItem}>
        <div className="form-grid">
          <Field label="Nom" value={form.name} onChange={v => update('name', v)} required />
          <Field label="Catégorie" value={form.category} onChange={v => update('category', v)} />
          <Field label="Fournisseur" value={form.supplier} onChange={v => update('supplier', v)} />
          <Field label="Réf magasin Cosette" value={form.store_reference} onChange={v => update('store_reference', v)} />
          <Field label="Réf fournisseur" value={form.supplier_reference} onChange={v => update('supplier_reference', v)} />
          <Field label="Code-barres / SKU optionnel" value={form.sku} onChange={v => update('sku', v)} />

          <div>
            <label>Origine achat</label>
            <select value={form.purchase_origin} onChange={e => update('purchase_origin', e.target.value)}>
              <option value="FR">France</option>
              <option value="UE">UE fournisseur HT</option>
              <option value="HORS_UE">Hors UE</option>
            </select>
          </div>

          <Field label="Stock" type="number" value={form.stock_qty} onChange={v => update('stock_qty', v)} />
          <Field label="Seuil alerte" type="number" value={form.min_qty} onChange={v => update('min_qty', v)} />
          <Field label="Prix TTC client" type="number" step="0.01" value={form.price_ttc} onChange={v => update('price_ttc', v)} />
          <Field label="TVA vente %" type="number" step="0.01" value={form.sale_vat_rate} onChange={v => update('sale_vat_rate', v)} />
          <Field label="Achat HT fournisseur" type="number" step="0.01" value={form.purchase_price_ht} onChange={v => update('purchase_price_ht', v)} />
          <Field label="TVA achat récupérable" type="number" step="0.01" value={form.purchase_vat_recoverable} onChange={v => update('purchase_vat_recoverable', v)} />
          <Field label="Peinture HT / pièce" type="number" step="0.01" value={form.paint_cost_ht} onChange={v => update('paint_cost_ht', v)} />
          <Field label="Cuisson HT / pièce" type="number" step="0.01" value={form.firing_cost_ht} onChange={v => update('firing_cost_ht', v)} />
          <Field label="Emballage HT / pièce" type="number" step="0.01" value={form.packaging_cost_ht} onChange={v => update('packaging_cost_ht', v)} />
          <Field label="Autres frais HT / pièce" type="number" step="0.01" value={form.other_fixed_cost_ht} onChange={v => update('other_fixed_cost_ht', v)} />
          <Field label="Frais paiement %" type="number" step="0.01" value={form.payment_fee_rate} onChange={v => update('payment_fee_rate', v)} />
        </div>

        <div className="full-field">
          <label>Note</label>
          <textarea value={form.note || ''} onChange={e => update('note', e.target.value)} rows="3" placeholder="Emplacement, fournisseur, remarque, couleur, etc." />
        </div>

        <div className="preview-box">
          <span>Prévisualisation marge</span>
          <strong>{money(marginHT(previewItem))}</strong>
          <small>
            Prix HT {money(priceHT(previewItem))} · TVA vente {money(vatCollected(previewItem))} · Coût HT complet {money(fullCostHT(previewItem))} · Marge {percent(marginRate(previewItem))}
          </small>
        </div>

        <button className="primary" disabled={saving}>{saving ? 'Enregistrement…' : 'Enregistrer'}</button>
      </form>
    </section>
  )
}

function Field({ label, value, onChange, type = 'text', step, required }) {
  return (
    <div>
      <label>{label}</label>
      <input type={type} step={step} value={value ?? ''} onChange={e => onChange(e.target.value)} required={required} />
    </div>
  )
}
