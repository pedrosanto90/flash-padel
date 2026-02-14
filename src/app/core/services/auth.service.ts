import { Injectable, signal, computed, effect } from '@angular/core';
import { Router } from '@angular/router';
import { Session, User, AuthError } from '@supabase/supabase-js';
import { SupabaseService } from './supabase.service';
import { Profile, ProfileUpdate } from '../models';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly session = signal<Session | null>(null);
  private readonly _profile = signal<Profile | null>(null);
  private readonly _loading = signal(true);

  readonly profile = this._profile.asReadonly();
  readonly loading = this._loading.asReadonly();
  readonly isAuthenticated = computed(() => !!this.session());
  readonly currentUser = computed(() => this.session()?.user ?? null);
  readonly isOrganizer = computed(() => this._profile()?.is_organizer ?? false);
  readonly isPlayer = computed(() => this._profile()?.is_player ?? false);

  constructor(
    private readonly supabase: SupabaseService,
    private readonly router: Router
  ) {
    this.initAuth();
  }

  private async initAuth(): Promise<void> {
    try {
      const { data } = await this.supabase.auth.getSession();
      this.session.set(data.session);

      if (data.session?.user) {
        await this.loadProfile(data.session.user.id);
      }
    } finally {
      this._loading.set(false);
    }

    this.supabase.auth.onAuthStateChange(async (event, session) => {
      this.session.set(session);

      if (event === 'SIGNED_IN' && session?.user) {
        await this.loadProfile(session.user.id);
      } else if (event === 'SIGNED_OUT') {
        this._profile.set(null);
      }
    });
  }

  private async loadProfile(userId: string): Promise<void> {
    const { data, error } = await this.supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();

    if (!error && data) {
      this._profile.set(data as Profile);
    }
  }

  async signUp(
    email: string,
    password: string,
    fullName: string
  ): Promise<{ error: AuthError | null }> {
    const { error } = await this.supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName },
      },
    });
    return { error };
  }

  async signIn(
    email: string,
    password: string
  ): Promise<{ error: AuthError | null }> {
    const { error } = await this.supabase.auth.signInWithPassword({
      email,
      password,
    });
    return { error };
  }

  async signOut(): Promise<void> {
    await this.supabase.auth.signOut();
    this.router.navigate(['/auth/login']);
  }

  async updateProfile(
    updates: ProfileUpdate
  ): Promise<{ error: unknown | null }> {
    const user = this.currentUser();
    if (!user) return { error: { message: 'Not authenticated' } };

    const { error } = await this.supabase
      .from('profiles')
      .update(updates)
      .eq('id', user.id);

    if (!error) {
      await this.loadProfile(user.id);
    }

    return { error };
  }

  async refreshProfile(): Promise<void> {
    const user = this.currentUser();
    if (user) {
      await this.loadProfile(user.id);
    }
  }
}
