import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { HomePage } from './pages/HomePage';
import { ExplorePage } from './pages/ExplorePage';
import { SearchPage } from './pages/SearchPage';
import { LibraryPage } from './pages/LibraryPage';
import { ArtistPage, ArtistSongsPage, AlbumPage, PlaylistPage } from './pages/DetailPages';
import { MoodPage } from './pages/MoodPage';
import { LocalPlaylistPage } from './pages/LocalPlaylistPage';
import { MixPage } from './pages/MixPage';
import { ImportPage } from './pages/ImportPage';
import { OfflinePage } from './pages/OfflinePage';
import { TvPage } from './pages/TvPage';
import { ProfilePage } from './pages/ProfilePage';
import { AdminPage } from './pages/AdminPage';
import { VerifyEmailPage } from './pages/VerifyEmailPage';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="tv" element={<TvPage />} />
        <Route element={<Layout />}>
          <Route index element={<HomePage />} />
          <Route path="explore" element={<ExplorePage />} />
          <Route path="search" element={<SearchPage />} />
          <Route path="library" element={<LibraryPage />} />
          <Route path="import" element={<ImportPage />} />
          <Route path="offline" element={<OfflinePage />} />
          <Route path="profile" element={<ProfilePage />} />
          <Route path="admin" element={<AdminPage />} />
          <Route path="verify-email" element={<VerifyEmailPage />} />
          <Route path="artist/:id/songs" element={<ArtistSongsPage />} />
          <Route path="artist/:id" element={<ArtistPage />} />
          <Route path="album/:id" element={<AlbumPage />} />
          <Route path="playlist/:id" element={<PlaylistPage />} />
          <Route path="mix/:id" element={<MixPage />} />
          <Route path="mood/:id" element={<MoodPage />} />
          <Route path="local-playlist/:id" element={<LocalPlaylistPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
