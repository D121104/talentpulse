import { ThemeProvider } from './context/ThemeContext';
import LandingPage from './pages/LandingPage';

function App() {
  return (
    <ThemeProvider>
      <LandingPage />
    </ThemeProvider>
  );
}

export default App;
