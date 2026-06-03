#!/usr/bin/env bash
set -e
export TORCH_CUDA_ARCH_LIST="8.9"   # RTX 4090
cd /workspace/Hunyuan3D-2

echo "########## STEP 1: requirements.txt ##########"
# torch/torchvision already installed (2.4.1+cu124) and unpinned in requirements -> pip keeps them
pip install -r requirements.txt

echo "########## STEP 2: pip install -e . ##########"
pip install -e .

echo "########## STEP 3: build custom_rasterizer ##########"
cd hy3dgen/texgen/custom_rasterizer
python3 setup.py install
cd /workspace/Hunyuan3D-2

echo "########## STEP 4: build differentiable_renderer ##########"
cd hy3dgen/texgen/differentiable_renderer
python3 setup.py install
cd /workspace/Hunyuan3D-2

echo "########## SETUP DONE ##########"
python3 -c "import torch; print('torch', torch.__version__, 'cuda', torch.cuda.is_available())"
python3 -c "import custom_rasterizer; print('custom_rasterizer OK')"
