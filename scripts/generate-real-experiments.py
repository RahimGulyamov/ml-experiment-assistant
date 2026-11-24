"""Reproducible softmax training on Iris. Requires only NumPy, no API or network.
Usage: python scripts/generate-real-experiments.py
The dataset is vendored and checked by SHA256. No test set is used: all reported
scores are validation scores, and they must not be called unbiased test estimates.
"""
from pathlib import Path
import csv
import hashlib
import json
import platform
import time
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
path = ROOT / 'data/iris.csv'
expected = 'f13ffa8fdd56fd8e6c8d16d4081a3fbd3114bcd0aae4256c43205169cd9d1449'
if hashlib.sha256(path.read_bytes()).hexdigest() != expected:
    raise ValueError('Iris dataset checksum mismatch')
with path.open() as f:
    rows = list(csv.reader(f))[1:]
x = np.array([[float(v) for v in r[:4]] for r in rows])
y = np.array([int(r[4]) for r in rows])
rng = np.random.default_rng(2026)
train, val = [], []
for cls in range(3):
    ids = rng.permutation(np.flatnonzero(y == cls))
    train.extend(ids[:40]); val.extend(ids[40:])
train, val = np.array(train), np.array(val)
mean, std = x[train].mean(axis=0), x[train].std(axis=0)
features = np.column_stack(((x - mean) / std, np.ones(len(x))))
targets = np.eye(3)[y]

def probabilities(weights):
    logits = features @ weights
    logits -= logits.max(axis=1, keepdims=True)
    exp = np.exp(logits)
    return exp / exp.sum(axis=1, keepdims=True)

def loss(p, ids):
    return float(-np.log(np.clip(p[ids, y[ids]], 1e-15, 1)).mean())

configs = [
    ('Baseline', .03, 0., 40, 42),
    ('More epochs', .03, 0., 200, 42),
    ('Higher learning rate', .15, 0., 200, 42),
    ('L2 regularization', .15, .03, 200, 42),
    ('Strong regularization', .15, .5, 200, 42),
    ('Repeat seed 43', .15, .03, 200, 43),
]
runs = []
for index, (name, lr, l2, epochs, seed) in enumerate(configs, 1):
    w = np.random.default_rng(seed).normal(0, .03, size=(5, 3))
    start, history = time.perf_counter(), []
    for step in range(1, epochs + 1):
        p = probabilities(w)
        regularizer = w.copy(); regularizer[-1] = 0  # Do not penalize bias.
        grad = features[train].T @ (p[train] - targets[train]) / len(train) + l2 * regularizer
        w -= lr * grad
        if step == 1 or step % 5 == 0 or step == epochs:
            p = probabilities(w)
            history.append({'step': step, 'train_loss': round(loss(p, train), 8), 'val_loss': round(loss(p, val), 8)})
    duration = time.perf_counter() - start
    p = probabilities(w); pred = p[val].argmax(axis=1)
    f1 = []
    for cls in range(3):
        tp = int(((pred == cls) & (y[val] == cls)).sum())
        fp = int(((pred == cls) & (y[val] != cls)).sum())
        fn = int(((pred != cls) & (y[val] == cls)).sum())
        f1.append(2 * tp / (2 * tp + fp + fn) if 2 * tp + fp + fn else 0.)
    runs.append({
        'id': f'iris-{index:03}', 'name': name,
        'experiment': 'iris-softmax-v1', 'dataset': 'Iris-150',
        'split': 'stratified-120-30-seed2026', 'status': 'finished',
        'duration_seconds': round(duration, 6),
        'params': {'model': 'softmax-regression', 'learning_rate': lr, 'l2': l2,
                   'epochs': epochs, 'seed': seed, 'split_seed': 2026,
                   'scaling': 'train-only standardization'},
        'metrics': {'accuracy': round(float((pred == y[val]).mean()), 8),
                    'f1_macro': round(float(np.mean(f1)), 8), 'val_loss': round(loss(p, val), 8)},
        'history': history,
    })
output = ROOT / 'public/examples/measured-iris.json'
output.write_text(json.dumps(runs, indent=2) + '\n')
metadata = {'dataset_sha256': expected, 'python': platform.python_version(),
            'numpy': np.__version__, 'train_samples': 120, 'validation_samples': 30,
            'note': 'Actually measured training; duration varies with hardware. No independent test set.'}
(ROOT / 'data/measurement-environment.json').write_text(json.dumps(metadata, indent=2) + '\n')
print(f'Wrote {len(runs)} measured runs to {output}')
for r in runs:
    print(r['id'], r['metrics'])
