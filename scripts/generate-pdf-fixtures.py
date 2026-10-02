"""Regenerate deterministic PDF integration fixtures (requires reportlab and pypdf)."""
from pathlib import Path
from reportlab.pdfgen import canvas
from reportlab.lib.utils import ImageReader
from PIL import Image, ImageDraw
from pypdf import PdfReader, PdfWriter

ROOT = Path(__file__).resolve().parents[1] / 'test-fixtures' / 'pdf'
ROOT.mkdir(parents=True, exist_ok=True)
def writer(name):
    return canvas.Canvas(str(ROOT / name), pagesize=(612, 792), invariant=1)

c = writer('text.pdf')
c.drawString(60, 730, 'Biology - page one')
c.drawString(60, 690, 'Photosynthesis uses sunlight to make sugar from water and carbon dioxide.')
c.showPage()
c.drawString(60, 730, 'Biology - page two')
c.drawString(60, 690, 'Respiration releases energy. The secret reference word is marigold.')
c.save()

c = writer('columns.pdf')
c.drawString(60, 730, 'Two-column extraction fixture')
for column, x in [('LEFT', 60), ('RIGHT', 330)]:
    for line in range(12):
        c.drawString(x, 680 - line * 25, f'{column} column sentence {line + 1}.')
c.save()

c = writer('large.pdf')
for page in range(1, 301):
    c.drawString(60, 730, f'Large document page {page}')
    c.drawString(60, 690, f'Reference marker PAGE_{page}.')
    c.showPage()
c.save()

c = writer('page-limit.pdf')
for page in range(301):
    c.drawString(60, 730, f'Over-limit page {page + 1}')
    c.showPage()
c.save()

image = Image.new('RGB', (1000, 400), 'white')
ImageDraw.Draw(image).text((80, 100), 'SCANNED PAGE - image pixels only, no PDF text layer', fill='black')
reader = ImageReader(image)
c = writer('scanned.pdf')
c.drawImage(reader, 60, 400, width=492, height=196)
c.save()
c = writer('mixed.pdf')
c.drawImage(reader, 60, 400, width=492, height=196)
c.showPage()
c.drawString(60, 730, 'Searchable text begins on page two. The marker is coriander.')
c.save()

locked = PdfWriter()
locked.append(PdfReader(ROOT / 'text.pdf'))
locked.encrypt('fixture-password')
locked.write(ROOT / 'locked.pdf')
(ROOT / 'corrupt.pdf').write_bytes(b'%PDF-1.7\nThis is deliberately not a valid PDF.\n')

for name in ('text.pdf', 'columns.pdf', 'large.pdf', 'mixed.pdf'):
    pdf = PdfReader(ROOT / name)
    assert any(page.extract_text().strip() for page in pdf.pages)
assert not PdfReader(ROOT / 'scanned.pdf').pages[0].extract_text().strip()
assert len(PdfReader(ROOT / 'large.pdf').pages) == 300
assert len(PdfReader(ROOT / 'page-limit.pdf').pages) == 301
assert PdfReader(ROOT / 'locked.pdf').is_encrypted
print('PDF fixtures generated and structurally verified.')
