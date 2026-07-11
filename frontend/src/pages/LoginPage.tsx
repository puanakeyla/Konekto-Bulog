import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'

export default function LoginPage() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const { login } = useAuth()
  const navigate = useNavigate()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    try {
      await login(username, password)
      navigate('/dashboard')
    } catch {
      setError('Username atau password salah.')
    }
  }

  return (
    <div className="page-shell flex items-center justify-center">
      <form
        onSubmit={handleSubmit}
        className="panel panel-pad w-full max-w-sm"
      >
        <h1 className="page-title mb-6">Masuk ke Konekto</h1>

        {error && (
          <p className="alert-danger mb-4">{error}</p>
        )}

        <label className="label">Username</label>
        <input
          className="input mb-4"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          autoFocus
        />

        <label className="label">Password</label>
        <input
          type="password"
          className="input mb-6"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />

        <button
          type="submit"
          className="btn btn-primary w-full"
        >
          Masuk
        </button>
      </form>
    </div>
  )
}
