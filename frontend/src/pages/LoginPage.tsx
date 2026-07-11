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
      navigate('/')
    } catch {
      setError('Username atau password salah.')
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface">
      <form
        onSubmit={handleSubmit}
        className="bg-white rounded-lg shadow p-8 w-full max-w-sm"
      >
        <h1 className="text-xl font-medium text-primary mb-6">Masuk ke Konekto</h1>

        {error && (
          <p className="text-danger bg-danger-bg rounded px-3 py-2 text-sm mb-4">
            {error}
          </p>
        )}

        <label className="block text-sm mb-1">Username</label>
        <input
          className="w-full border rounded px-3 py-2 mb-4"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          autoFocus
        />

        <label className="block text-sm mb-1">Password</label>
        <input
          type="password"
          className="w-full border rounded px-3 py-2 mb-6"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />

        <button
          type="submit"
          className="w-full bg-primary text-white rounded py-2 font-medium hover:bg-primary-dark"
        >
          Masuk
        </button>
      </form>
    </div>
  )
}
