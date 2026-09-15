import io, os, uuid
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

def load_model():
    global MODEL
    if MODEL is not None: return MODEL
    checkpoint = torch.load(MODEL_PATH, map_location='cpu', weights_only=False)
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
