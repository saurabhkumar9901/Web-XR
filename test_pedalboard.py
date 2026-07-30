import numpy as np
from pedalboard import Pedalboard, PitchShift
board = Pedalboard([PitchShift(semitones=5)])
out = 0
for i in range(20):
    s = board(np.zeros((1, 1024), dtype=np.float32), 32400, reset=False)
    out += s.shape[1]
print('Total output:', out)
