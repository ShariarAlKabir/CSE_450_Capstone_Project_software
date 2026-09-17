import io, os, uuid, zipfile
from typing import Any
import torch
from PIL import Image
from torchvision import models, transforms
from typing import Optional

from fastapi import APIRouter, UploadFile, File, Form, HTTPException
from app.db import get_db

router = APIRouter(prefix='/api/non-deterministic', tags=['Non-deterministic'])
MODEL = None
CLASSES = ['Cutting','Folding','Non_Faulty','Shade_color','Text_distortion','Weaving_Peak','Yarn_Missing']
# backend/app/routes/ -> backend/. Two dirname() calls landed on
# backend/app/weights, which does not exist, so every call to this route
# returned a 500. fabric.py already resolves it with three.
MODEL_PATH = os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(__file__))),
    'weights',
    'best_model.zip',
)

def _resolve_checkpoint() -> str:
    """Return a loadable checkpoint path, rebuilding the archive if needed.

    .gitignore excludes *.zip, so best_model.zip is not in the repository and a
    fresh clone has only the extracted best_model/ directory beside it. torch
    cannot load that directory directly, so repack it once into the expected
    archive. Everything needed is already on disk; nothing is downloaded.
    """
    if os.path.exists(MODEL_PATH):
        return MODEL_PATH

    extracted = os.path.join(os.path.dirname(MODEL_PATH), 'best_model')
    if not os.path.isdir(extracted):
        raise HTTPException(
            status_code=503,
            detail=(
                'Non-deterministic model weights are missing. Expected '
                f'{MODEL_PATH} or an extracted best_model/ directory beside it.'
            ),
        )

    root = os.path.dirname(MODEL_PATH)
    tmp = MODEL_PATH + '.building'
    with zipfile.ZipFile(tmp, 'w', zipfile.ZIP_STORED) as archive:
        for dirpath, _, filenames in os.walk(extracted):
            for name in sorted(filenames):
                full = os.path.join(dirpath, name)
                # torch's archive keys are paths relative to the weights dir,
                # and zip cannot store the pre-1980 mtimes git checkouts carry.
                entry = zipfile.ZipInfo(os.path.relpath(full, root), date_time=(1980, 1, 1, 0, 0, 0))
                entry.compress_type = zipfile.ZIP_STORED
                with open(full, 'rb') as handle:
                    archive.writestr(entry, handle.read())
    os.replace(tmp, MODEL_PATH)
    return MODEL_PATH


def load_model():
    global MODEL
    if MODEL is not None: return MODEL
    checkpoint = torch.load(_resolve_checkpoint(), map_location='cpu', weights_only=False)
    state = checkpoint['model_state_dict']
    model = models.resnet50(weights=None)
    model.fc = torch.nn.Sequential(torch.nn.Linear(model.fc.in_features,512), torch.nn.ReLU(), torch.nn.Dropout(0.4), torch.nn.Linear(512,len(CLASSES)))
    model.load_state_dict(state); model.eval(); MODEL=model
    return model

transform = transforms.Compose([transforms.Resize((224,224)), transforms.ToTensor(), transforms.Normalize([0.485,0.456,0.406],[0.229,0.224,0.225])])

@router.get('')
def health(): return {'status':'ok','message':'Non-deterministic label model is ready','classes':CLASSES}

@router.post('/inspect')
async def inspect(file: UploadFile = File(...), sample_id: Optional[int] = Form(None)):
    """Classify one label image.

    sample_id is optional but recommended: without it the inspection cannot be
    traced back to a shipment or supplier, and it shows in the queue as an
    ad-hoc capture with no supplier attached.
    """
    raw = await file.read()
    try: image = Image.open(io.BytesIO(raw)).convert('RGB')
    except Exception as exc: raise HTTPException(status_code=400, detail='Please upload a valid image') from exc
    tensor = transform(image).unsqueeze(0)
    with torch.no_grad():
        probs = torch.softmax(load_model()(tensor), dim=1)[0]
    confidence, index = torch.max(probs, 0)
    predictions = sorted([{'class_name': CLASSES[i], 'confidence': round(float(probs[i]),4)} for i in range(len(CLASSES))], key=lambda x:x['confidence'], reverse=True)
    # Canonical vocabulary. This used to write 'Pass'/'Review', which no reader
    # matched: a passing label was graded Reject and raised an alert.
    verdict = 'PASS' if CLASSES[index] == 'Non_Faulty' else 'REVIEW'
    # psycopg2 cannot adapt a raw uuid.UUID; deterministic.py already casts.
    report_id = str(uuid.uuid4())
    conn = get_db()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "INSERT INTO label_inspections "
                "(report_id, sample_id, inspection_mode, verdict, verdict_detail, confidence_score, status) "
                "VALUES (%s,%s,'Non-deterministic',%s,%s,%s,%s)",
                (report_id, sample_id, verdict, CLASSES[index], float(confidence),
                 'Approved' if verdict == 'PASS' else 'Pending Review'),
            )
            conn.commit()
    finally: conn.close()
    return {'report_id': report_id, 'filename': file.filename, 'verdict': verdict, 'predicted_class': CLASSES[index], 'confidence': round(float(confidence),4), 'predictions': predictions}
