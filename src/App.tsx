import { AppProvider, useApp } from "./lib/store";
import { Layout } from "./components/Layout";
import { Dashboard } from "./pages/Dashboard";
import { Collection } from "./pages/Collection";
import { Producers } from "./pages/Producers";
import { Sender } from "./pages/Sender";
import { History } from "./pages/History";
import { Templates } from "./pages/Templates";
import { ExportPage } from "./pages/ExportPage";
import { SettingsPage } from "./pages/SettingsPage";

function Router() {
  const { route } = useApp();
  switch (route) {
    case "collection": return <Collection />;
    case "producers": return <Producers />;
    case "sender": return <Sender />;
    case "history": return <History />;
    case "templates": return <Templates />;
    case "export": return <ExportPage />;
    case "settings": return <SettingsPage />;
    default: return <Dashboard />;
  }
}

export default function App() {
  return (
    <AppProvider>
      <Layout>
        <Router />
      </Layout>
    </AppProvider>
  );
}
