import { BrowserRouter, Routes, Route } from "react-router-dom";

import Home from "./pages/Home";
import LabelInspection from "./pages/LabelInspection";
import FabricInspection from "./pages/FabricInspection";
import Deterministic from "./pages/Deterministic";
import NonDeterministic from "./pages/NonDeterministic";

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

            </Routes>
        </BrowserRouter>
    );
}

export default App;
