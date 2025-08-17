type Vector = number[];

function euclideanDistance(a: Vector, b: Vector): number {
  return Math.sqrt(a.reduce((sum, val, i) => sum + (val - b[i]) ** 2, 0));
}

function mean(vectors: Vector[]): Vector {
  const n = vectors.length;
  const dim = vectors[0].length;
  const result = new Array(dim).fill(0);
  for (const vec of vectors) {
    for (let i = 0; i < dim; i++) {
      result[i] += vec[i];
    }
  }
  return result.map((sum) => sum / n);
}

export function kMeans(
  data: Vector[],
  k: number,
  maxIters = 100,
): { centroids: Vector[]; assignments: number[] } {
  const centroids = [...data]
    .sort(() => Math.random() - 0.5)
    .slice(0, k)
    .map((v) => [...v]);

  let assignments = new Array(data.length).fill(-1);

  for (let iter = 0; iter < maxIters; iter++) {
    const newAssignments = data.map((point) => {
      let minDist = Infinity;
      let best = 0;
      centroids.forEach((centroid, idx) => {
        const dist = euclideanDistance(point, centroid);
        if (dist < minDist) {
          minDist = dist;
          best = idx;
        }
      });
      return best;
    });

    if (newAssignments.every((v, i) => v === assignments[i])) {
      break;
    }

    assignments = newAssignments;

    for (let i = 0; i < k; i++) {
      const assigned = data.filter((_, idx) => assignments[idx] === i);
      if (assigned.length > 0) {
        centroids[i] = mean(assigned);
      }
    }
  }

  return { centroids, assignments };
}
