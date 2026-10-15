# Modelos 3D profissionais do bebé

A app mostra por omissão um bebé gerado por código. Se existirem modelos 3D profissionais em
`public/models/baby/`, usa-os nas semanas mais próximas de cada modelo e mantém o gerado por código
nas restantes (e como alternativa se um modelo falhar a carregar).

## Escolher e comprar
1. **Licença primeiro.** Tem de permitir usar o modelo numa app (gratuita ou paga) e distribuir ficheiros
   convertidos (GLB) aos utilizadores. Muitas licenças permitem "uso num projeto" mas proíbem distribuir o modelo
   de forma que outros o possam extrair. Pergunta ao vendedor (exemplo abaixo) e guarda a resposta.
2. **Fases.** Um modelo por fase serve as semanas à volta dele (por omissão até 7 semanas de distância).
   Um conjunto como 6, 9, 12, 18, 31 e 41 semanas cobre bem a gravidez; as semanas 1 a 5 ficam com o gerado por código.
3. **Formato.** OBJ ou GLB/glTF servem diretamente. FBX: converte para GLB (Blender: File > Export > glTF 2.0).
4. **Texturas.** De preferência cor (albedo), normais e rugosidade. Se vierem num ficheiro à parte, mantém-nas ao lado do modelo.
5. **Tamanho.** A app simplifica para cerca de 60 mil triângulos por modelo e comprime as texturas.

Pergunta tipo para o vendedor:

> I'd like to use your fetus models inside a free mobile web app (real-time 3D viewer; files converted to GLB and
> served to users' browsers). Does your license allow embedding the models, or derived GLB files, in such an app?

## Preparar um modelo
```
cd tools/baby-models
npm install
node prepare.mjs caminho/modelo.obj --week 18 --length 14.2 --tris 60000 --tex 2048
```
Cria `public/models/baby/w18.glb` e regista a fase em `public/models/baby/manifest.json`.
Se o bebé aparecer deitado ou de costas, ajusta com `--rx/--ry/--rz` (graus) e volta a correr.

## Manifesto (`public/models/baby/manifest.json`)
```json
{
  "credit": "Modelos: Autor, licença X.",
  "maxGap": 7,
  "stages": [
    { "week": 12, "file": "w12.glb", "lengthCm": 5.4, "rotation": [0, 0, 0] }
  ]
}
```
- `credit`: texto mostrado por baixo do bebé (obrigatório se a licença exigir atribuição).
- `maxGap`: distância máxima, em semanas, a que um modelo ainda serve uma semana sem modelo próprio.
- Sem manifesto ou sem fases, a app usa só o bebé gerado por código.
