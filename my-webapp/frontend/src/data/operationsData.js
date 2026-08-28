export const suppliers = [
    { id: "sup-01", name: "Bangladesh Textile Co.", initials: "BT", scope: "Both", tier: "Preferred", trend: "Improving", score: 92, quality: 94, cost: 88, delivery: 96, defectRate: 1.8, effectiveCost: 3.42, copq: 1840, onTime: 96, spend: 38, fingerprint: "Oil spot / print shift", renewal: "18 Sep 2026", location: "Dhaka, Bangladesh", contact: "Rahman Hossain", shipments: 14, rejections: 0, heatmap: ["a", "a", "b", "a", "a", "a", "a", "b", "a", "a", "a", "a"] },
    { id: "sup-02", name: "Apex Fabric Ltd.", initials: "AF", scope: "Fabric", tier: "Standard", trend: "Stable", score: 86, quality: 88, cost: 84, delivery: 87, defectRate: 2.7, effectiveCost: 3.67, copq: 3320, onTime: 87, spend: 28, fingerprint: "Weft bar", renewal: "04 Nov 2026", location: "Chattogram, Bangladesh", contact: "Karim Uddin", shipments: 11, rejections: 1, heatmap: ["b", "a", "b", "b", "a", "b", "c", "b", "b", "a", "b", "b"] },
    { id: "sup-03", name: "Northern Weaves", initials: "NW", scope: "Both", tier: "Watchlist", trend: "Declining", score: 74, quality: 71, cost: 80, delivery: 73, defectRate: 5.4, effectiveCost: 4.11, copq: 7240, onTime: 73, spend: 19, fingerprint: "Hole / tear / barcode drift", renewal: "29 Aug 2026", location: "Gazipur, Bangladesh", contact: "Nadia Islam", shipments: 9, rejections: 3, heatmap: ["b", "c", "b", "c", "r", "c", "c", "b", "r", "c", "r", "c"] },
    { id: "sup-04", name: "Pacific Mills", initials: "PM", scope: "Label", tier: "Preferred", trend: "Stable", score: 90, quality: 91, cost: 86, delivery: 93, defectRate: 2.1, effectiveCost: 3.51, copq: 2110, onTime: 93, spend: 15, fingerprint: "Color variation", renewal: "12 Dec 2026", location: "Narayanganj, Bangladesh", contact: "Sadia Noor", shipments: 8, rejections: 0, heatmap: ["a", "a", "b", "a", "a", "b", "a", "a", "a", "b", "a", "a"] },
];

export const shipments = [
    { id: "SH-24091", scope: "Fabric", supplier: "Bangladesh Textile Co.", fabric: "Indigo denim", rolls: 48, received: "Today, 09:40", stage: "Inspecting", quality: 94, sampling: "Second", progress: 58, value: "$18,420" },
    { id: "SH-24088", scope: "Fabric", supplier: "Apex Fabric Ltd.", fabric: "White cotton twill", rolls: 30, received: "Yesterday", stage: "Cleared", quality: 89, sampling: "Final", progress: 100, value: "$11,930" },
    { id: "SH-24084", scope: "Both", supplier: "Northern Weaves", fabric: "Black rib knit + care labels", rolls: 42, received: "26 Aug", stage: "Rejected", quality: 68, sampling: "Final", progress: 100, value: "$16,080" },
    { id: "SH-24080", scope: "Label", supplier: "Pacific Mills", fabric: "Woven brand labels", rolls: 36, received: "24 Aug", stage: "Cleared", quality: 92, sampling: "Final", progress: 100, value: "$14,760" },
    { id: "SH-24076", scope: "Both", supplier: "Bangladesh Textile Co.", fabric: "Stretch denim + size labels", rolls: 28, received: "22 Aug", stage: "In transit", quality: null, sampling: "Initial", progress: 18, value: "$10,640" },
];

export const inspections = [
    { id: "IN-8321", scope: "Fabric", roll: "R-24091-12", supplier: "Bangladesh Textile Co.", status: "Needs review", grade: "B", confidence: 92, defects: 3, time: "11 min ago" },
    { id: "IN-8320", scope: "Label", roll: "LBL-24091-11", supplier: "Bangladesh Textile Co.", status: "Approved", grade: "A", confidence: 98, defects: 1, time: "17 min ago" },
    { id: "IN-8319", scope: "Fabric", roll: "R-24088-07", supplier: "Apex Fabric Ltd.", status: "Approved", grade: "A", confidence: 96, defects: 0, time: "Yesterday" },
    { id: "IN-8318", scope: "Both", roll: "R-24084-03", supplier: "Northern Weaves", status: "Rejected", grade: "Reject", confidence: 94, defects: 8, time: "26 Aug" },
];

export const activity = [
    { title: "Inspection IN-8321 flagged for review", detail: "3 defects found on R-24091-12", time: "11 min ago", tone: "warning" },
    { title: "Shipment SH-24088 cleared", detail: "Final sample passed at 89 quality score", time: "Yesterday", tone: "success" },
    { title: "Northern Weaves moved to Watchlist", detail: "Third rejection in 30 days", time: "26 Aug", tone: "danger" },
    { title: "ROI report generated", detail: "August management pack is ready", time: "25 Aug", tone: "info" },
];

export const trendData = [78, 82, 80, 85, 84, 89, 87, 91, 94, 92, 95, 96];
export const gradeDistribution = [{ label: "A", value: 48, tone: "grade-a" }, { label: "B", value: 31, tone: "grade-b" }, { label: "C", value: 14, tone: "grade-c" }, { label: "Reject", value: 7, tone: "grade-r" }];
export const defectBreakdown = [{ label: "Oil spot", value: 36 }, { label: "Weft bar", value: 25 }, { label: "Hole / tear", value: 18 }, { label: "Color variation", value: 13 }, { label: "Other", value: 8 }];
