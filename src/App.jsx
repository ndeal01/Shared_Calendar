import React from 'react'
import { Link, Routes, Route } from 'react-router-dom'

function Home() {
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100">
      <header className="p-4 border-b">
        <h1 className="text-2xl font-semibold">Family Calendar</h1>
      </header>
      <main className="p-4">
        <p className="mb-4">Month view placeholder — start building calendar here.</p>
        <nav className="space-x-2">
          <Link to="/members" className="text-teal-600">Members</Link>
          <Link to="/settings" className="ml-2 text-teal-600">Settings</Link>
        </nav>
      </main>
    </div>
  )
}

function Members() {
  return <div className="p-4">Members management (placeholder)</div>
}

function Settings() {
  return <div className="p-4">Settings (placeholder)</div>
}

export default function App(){
  return (
    <Routes>
      <Route path="/" element={<Home/>} />
      <Route path="/members" element={<Members/>} />
      <Route path="/settings" element={<Settings/>} />
    </Routes>
  )
}
