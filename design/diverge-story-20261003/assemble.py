"""Assemble page exports into a long PNG and a review overview (requires Pillow)."""
from pathlib import Path
from PIL import Image

root=Path(__file__).resolve().parent
pages=sorted((root/'png').glob('*.png'))
assert len(pages)==8, 'Expected exactly 8 page exports'
long=Image.new('RGB',(1080,1440*8),'#f5f2e9')
overview=Image.new('RGB',(1120,760),'#d8dcd2')
for i,p in enumerate(pages):
    image=Image.open(p).convert('RGB')
    assert image.size==(1080,1440), f'Incorrect dimensions: {p}'
    long.paste(image,(0,1440*i))
    overview.paste(image.resize((270,360),Image.Resampling.LANCZOS),((i%4)*280+5,(i//4)*380+8))
    image.resize((540,720),Image.Resampling.LANCZOS).save(root/'qa'/('half-'+p.name))
long.save(root/'long.png',optimize=True)
overview.save(root/'overview.jpg',quality=94)
print('Assembled long.png 1080×11520 and overview.jpg 1120×760')
