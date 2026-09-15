import { BrowserRouter, Routes, Route } from "react-router-dom";

import Home from "./pages/Home";
import LabelInspection from "./pages/LabelInspection";
import FabricInspection from "./pages/FabricInspection";
import Deterministic from "./pages/Deterministic";
import NonDeterministic from "./pages/NonDeterministic";
import Suppliers from "./pages/Suppliers";
import Shipments from "./pages/Shipments";
import Inspections from "./pages/Inspections";
import InspectionDetail from "./pages/InspectionDetail";
import Reports from "./pages/Reports";
import Notifications from "./pages/Notifications";
import Account from "./pages/Account";
import SupplierAnalytics from "./pages/SupplierAnalytics";
import ShipmentAnalytics from "./pages/ShipmentAnalytics";
import InspectionAnalytics from "./pages/InspectionAnalytics";
import QualityRoiAnalytics from "./pages/QualityRoiAnalytics";
import Blueprint from "./pages/Blueprint";

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
                <Route path="/inspections/:inspectionId" element={<InspectionDetail />} />
                <Route path="/reports" element={<Reports />} />
                <Route path="/blueprint" element={<Blueprint />} />
                <Route path="/notifications" element={<Notifications />} />
                <Route path="/account" element={<Account />} />

                {/* Dedicated Summary & Analytics Pages */}
                <Route path="/analytics/suppliers" element={<SupplierAnalytics />} />
                <Route path="/analytics/shipments" element={<ShipmentAnalytics />} />
                <Route path="/analytics/inspections" element={<InspectionAnalytics />} />
                <Route path="/analytics/defects" element={<InspectionAnalytics />} />
                <Route path="/analytics/quality" element={<QualityRoiAnalytics />} />
                <Route path="/analytics/roi" element={<QualityRoiAnalytics />} />
                <Route path="/analytics" element={<QualityRoiAnalytics />} />

            </Routes>
        </BrowserRouter>
    );
}

export default App;
