/**
 * Auth UI — login / register page.
 * Calls onSuccess(userData) when authenticated.
 */

import { authLogin, authRegister, getToken } from './api.js'

let _onSuccess = null

export function mountAuthPage(container, onSuccess) {
  _onSuccess = onSuccess
  _render(container, 'login')
}

export function isLoggedIn() {
  return !!getToken()
}

function _render(container, mode) {
  const isLogin = mode === 'login'
  container.innerHTML = `
    <div class="auth-page">
      <div class="auth-card">
        <div class="auth-logo">
          <span class="auth-logo-icon">🏗️</span>
          <span class="auth-logo-text">OptiBuilding</span>
        </div>
        <h2 class="auth-title">${isLogin ? 'Connexion' : 'Créer un compte'}</h2>

        <form id="auth-form" novalidate>
          <div class="auth-field">
            <label for="auth-email">Email</label>
            <input id="auth-email" type="email" placeholder="vous@exemple.fr" autocomplete="email" required />
          </div>
          <div class="auth-field">
            <label for="auth-password">Mot de passe</label>
            <input id="auth-password" type="password" placeholder="${isLogin ? '••••••••' : 'Min. 6 caractères'}" autocomplete="${isLogin ? 'current-password' : 'new-password'}" required />
          </div>
          <p id="auth-error" class="auth-error hidden"></p>
          <button type="submit" class="auth-submit" id="auth-submit-btn">
            ${isLogin ? 'Se connecter' : 'Créer mon compte'}
          </button>
        </form>

        <p class="auth-switch">
          ${isLogin
            ? 'Pas encore de compte ? <button class="auth-link" id="auth-switch-btn">S\'inscrire</button>'
            : 'Déjà un compte ? <button class="auth-link" id="auth-switch-btn">Se connecter</button>'
          }
        </p>
      </div>
    </div>
  `

  container.querySelector('#auth-switch-btn').addEventListener('click', () => {
    _render(container, isLogin ? 'register' : 'login')
  })

  container.querySelector('#auth-form').addEventListener('submit', async (e) => {
    e.preventDefault()
    const email    = container.querySelector('#auth-email').value.trim()
    const password = container.querySelector('#auth-password').value
    const errEl    = container.querySelector('#auth-error')
    const btn      = container.querySelector('#auth-submit-btn')

    errEl.classList.add('hidden')
    btn.disabled = true
    btn.textContent = isLogin ? 'Connexion…' : 'Création…'

    try {
      const data = isLogin
        ? await authLogin(email, password)
        : await authRegister(email, password)
      localStorage.setItem('ob_token', data.token)
      localStorage.setItem('ob_user_email', data.email)
      localStorage.setItem('ob_user_id', data.user_id)
      _onSuccess?.(data)
    } catch (err) {
      errEl.textContent = err.message
      errEl.classList.remove('hidden')
      btn.disabled = false
      btn.textContent = isLogin ? 'Se connecter' : 'Créer mon compte'
    }
  })
}
