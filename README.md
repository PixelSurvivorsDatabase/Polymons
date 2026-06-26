<p align="center">
  <img src="assets/polymons-logo.png" alt="Polymons logo" width="180">
</p>

# Polymons

Polymons is a platform for creating games, publishing them, playing games made
by other people, and spending time with friends.

## Poly Studio

Poly Studio is the Polymons game editor. Creators can build worlds, make user
interfaces, script gameplay in Luau, C++, or C#, playtest their work, and
publish games to Polymons.

## Polymons Player

Polymons Player is the Windows application used to launch and play Polymons
games. Games can be opened from the Player or through the Polymons website.

## Development

Polymons is currently in early development. Features and compatibility may
change while the platform, Player, and Studio are being built.

### Local Website Testing

Use this when you want to test the website and browser game without packaging
the Player or Studio apps.

1. Create `.env.local` from `.env.example` and fill in the Supabase/server
   secrets.
2. For local testing, set:

   ```env
   WEB_ORIGIN=http://localhost:5173
   VITE_POLYMONS_API_URL=http://localhost:10000
   ```

3. Start the local API and website together:

   ```powershell
   npm run dev:local
   ```

4. Open `http://localhost:5173`.

Vite hot-reloads website and browser-game changes, so most UI and in-game web
bugs can be tested immediately. Only package the `.exe` files when you need to
test installer/update behavior or Electron-only Player/Studio features.

### Large Files And Egress

Keep large public downloads out of Supabase Storage. Player and Studio download
buttons point to GitHub Releases, and PolyCode checkpoints should use direct
release asset URLs when possible. Supabase should mainly hold account data,
game metadata, and creator-uploaded images.
