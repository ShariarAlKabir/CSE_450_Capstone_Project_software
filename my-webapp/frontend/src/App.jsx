import { BrowserRouter, Routes, Route } from "react-router-dom";

import Home from "./pages/Home";
import LabelInspection from "./pages/LabelInspection";
import FabricInspection from "./pages/FabricInspection";
import Deterministic from "./pages/Deterministic";
import NonDeterministic from "./pages/NonDeterministic";
import Suppliers from "./pages/Suppliers";
import Shipments from "./pages/Shipments";
import Inspections from "./pages/Inspections";
import Reports from "./pages/Reports";
import Notifications from "./pages/Notifications";
import Account from "./pages/Account";

function App() {
    return (
        <BrowserRouter>
            <Routes>

                <Route
                    path="/"
                    element={<Home />}
                />

                <Route
                    path="/fabric-inspection"
                    element={<FabricInspection />}
                />

                <Route
                    path="/label-inspection"
                    element={<LabelInspection />}
                />

                <Route
                    path="/deterministic"
                    element={<Deterministic />}
                />

                <Route
                    path="/non-deterministic"
                    element={<NonDeterministic />}
                />

                <Route path="/suppliers" element={<Suppliers />} />
                <Route path="/shipments" element={<Shipments />} />
                <Route path="/inspections" element={<Inspections />} />
                <Route path="/reports" element={<Reports />} />
                <Route path="/notifications" element={<Notifications />} />
                <Route path="/account" element={<Account />} />

            </Routes>
        </BrowserRouter>
    );
}

export default App;
