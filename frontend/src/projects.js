/**
 * Projects list UI — shown after login, before entering the app.
 */

import { listProjects, createProject, deleteProject, clearToken } from './api.js'

let _onOpen   = null   // called with project data when user enters a project
let _onLogout = null   // called when user logs out

export function mountProjectsPage(container, onOpen, onLogout) {
  _onOpen   = onOpen
  _onLogout = onLogout
  _render(container)
}

async function _render(container) {
  const email = localStorage.getItem('ob_user_email') || ''
  container.innerHTML = `
    <div class="projects-page">
      <header class="projects-header">
        <div class="projects-header-left">
          <img class="projects-logo-img" src="/jean-renov-logo.png" alt="Jean Rénov" />
          <span class="projects-logo-text">Jean Rénov</span>
        </div>
        <div class="projects-header-right">
          <span class="projects-user-email">${_escHtml(email)}</span>
          <button class="projects-logout-btn" id="btn-logout">Déconnexion</button>
        </div>
      </header>

      <main class="projects-main">
        <div class="projects-top-bar">
          <h1 class="projects-title">Mes projets</h1>
          <button class="projects-new-btn" id="btn-new-project">+ Nouveau projet</button>
        </div>
        <div id="projects-list-wrap" class="projects-list-wrap">
          <div class="projects-loading">Chargement…</div>
        </div>
      </main>
    </div>
  `

  container.querySelector('#btn-logout').addEventListener('click', () => {
    clearToken()
    localStorage.removeItem('ob_user_email')
    localStorage.removeItem('ob_user_id')
    _onLogout?.()
  })

  container.querySelector('#btn-new-project').addEventListener('click', () => {
    _showNewProjectModal(container)
  })

  await _loadList(container)
}

async function _loadList(container) {
  const wrap = container.querySelector('#projects-list-wrap')
  if (!wrap) return
  try {
    const projects = await listProjects()
    if (!projects.length) {
      wrap.innerHTML = `
        <div class="projects-empty">
          <p>Aucun projet pour l'instant.</p>
          <p>Créez votre premier projet pour démarrer une étude énergétique.</p>
        </div>`
      return
    }
    wrap.innerHTML = `<div class="projects-grid">${projects.map(_projectCard).join('')}</div>`
    wrap.querySelectorAll('.projects-card-open').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = parseInt(btn.dataset.id)
        const p  = projects.find(x => x.id === id)
        if (p) _onOpen?.(p)
      })
    })
    wrap.querySelectorAll('.projects-card-delete').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation()
        const id   = parseInt(btn.dataset.id)
        const name = btn.dataset.name
        if (!confirm(`Supprimer le projet "${name}" ? Cette action est irréversible.`)) return
        try {
          await deleteProject(id)
          await _loadList(container)
        } catch (err) {
          alert('Erreur : ' + err.message)
        }
      })
    })
  } catch (err) {
    wrap.innerHTML = `<p class="projects-error">Erreur de chargement : ${err.message}</p>`
  }
}

function _projectCard(p) {
  const date    = p.updated_at ? new Date(p.updated_at).toLocaleDateString('fr-FR') : '—'
  const hasDPE  = p.analysis?.dpe_class
  const dpeHtml = hasDPE
    ? `<span class="projects-card-dpe" style="background:${_dpeColor(p.analysis.dpe_class)}">${p.analysis.dpe_class}</span>`
    : `<span class="projects-card-dpe projects-card-dpe--empty">—</span>`
  const zones   = p.geojson?.features?.length ?? 0
  return `
    <div class="projects-card">
      <div class="projects-card-head">
        ${dpeHtml}
        <div class="projects-card-meta">
          <span class="projects-card-name">${_escHtml(p.name)}</span>
          <span class="projects-card-date">Modifié le ${date}</span>
        </div>
      </div>
      <p class="projects-card-desc">${_escHtml(p.description || '')}</p>
      <div class="projects-card-stats">
        ${zones ? `<span>${zones} zone${zones > 1 ? 's' : ''}</span>` : '<span>Pas de zones</span>'}
        ${p.analysis ? '<span>Analysé</span>' : ''}
        ${p.renovation ? '<span>Rénovation</span>' : ''}
      </div>
      <div class="projects-card-actions">
        <button class="projects-card-open" data-id="${p.id}">Ouvrir →</button>
        <button class="projects-card-delete" data-id="${p.id}" data-name="${_escHtml(p.name)}" title="Supprimer">✕</button>
      </div>
    </div>`
}

function _showNewProjectModal(container) {
  const overlay = document.createElement('div')
  overlay.className = 'modal-overlay'
  overlay.innerHTML = `
    <div class="modal-box">
      <h3 class="modal-title">Nouveau projet</h3>
      <div class="auth-field">
        <label for="new-proj-name">Nom du projet</label>
        <input id="new-proj-name" type="text" placeholder="Ex : Maison individuelle Lyon" maxlength="255" />
      </div>
      <div class="auth-field">
        <label for="new-proj-desc">Description (optionnel)</label>
        <input id="new-proj-desc" type="text" placeholder="Rénovation BBC, audit DPE…" maxlength="500" />
      </div>
      <p id="modal-error" class="auth-error hidden"></p>
      <div class="modal-actions">
        <button class="modal-cancel" id="modal-cancel">Annuler</button>
        <button class="modal-confirm" id="modal-confirm">Créer</button>
      </div>
    </div>`
  document.body.appendChild(overlay)

  overlay.querySelector('#modal-cancel').addEventListener('click', () => overlay.remove())
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove() })

  const nameEl  = overlay.querySelector('#new-proj-name')
  const descEl  = overlay.querySelector('#new-proj-desc')
  const errEl   = overlay.querySelector('#modal-error')
  const confirm = overlay.querySelector('#modal-confirm')

  nameEl.focus()
  confirm.addEventListener('click', async () => {
    const name = nameEl.value.trim()
    if (!name) { errEl.textContent = 'Nom requis'; errEl.classList.remove('hidden'); return }
    confirm.disabled = true
    try {
      const project = await createProject(name, descEl.value.trim())
      overlay.remove()
      _onOpen?.(project)
    } catch (err) {
      errEl.textContent = err.message
      errEl.classList.remove('hidden')
      confirm.disabled = false
    }
  })
}

const _DPE_COLORS = {
  A: '#2ecc71', B: '#82e24d', C: '#c8e84d',
  D: '#f1c40f', E: '#f39c12', F: '#e67e22', G: '#e74c3c',
}
function _dpeColor(cls) { return _DPE_COLORS[cls] || '#888' }
function _escHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
