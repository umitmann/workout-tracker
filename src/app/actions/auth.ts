'use server'

import { createServerSupabaseClient } from '@/lib/supabase-server'
import { redirect } from 'next/navigation'

export async function signOut() {
  const supabase = await createServerSupabaseClient()
  await supabase.auth.signOut()
  redirect('/')
}

type AuthState = { error?: string; message?: string } | null

export async function signUpWithEmail(_prev: AuthState, formData: FormData): Promise<AuthState> {
  if (process.env.REGISTRATION_ENABLED !== 'true') {
    return { error: 'Registration is currently closed.' }
  }
  const email = formData.get('email') as string
  const password = formData.get('password') as string
  const supabase = await createServerSupabaseClient()
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/auth/confirm`,
    },
  })
  if (error) return { error: error.message }
  return { message: 'Check your email to confirm your account.' }
}

export async function signInWithEmail(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const email = formData.get('email') as string
  const password = formData.get('password') as string
  const supabase = await createServerSupabaseClient()
  const { error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) return { error: error.message }
  redirect('/dashboard')
}

export async function sendPasswordResetEmail(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const email = formData.get('email') as string
  const supabase = await createServerSupabaseClient()
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/auth/confirm?next=/auth/reset-password`,
  })
  if (error) return { error: error.message }
  return { message: 'If that email is registered, a reset link has been sent.' }
}

export async function updatePassword(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const password = formData.get('password') as string
  const supabase = await createServerSupabaseClient()
  const { error } = await supabase.auth.updateUser({ password })
  if (error) return { error: error.message }
  redirect('/dashboard')
}
