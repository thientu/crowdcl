var Thomson = (function() {
    var dt, energyKernel, forceKernel, n, points, force, part_energy, d_force, d_energy, context;
    var energies = [];
    var min = Number.MAX_VALUE;

    var energyKernel = function(points, result, n) {
        for (var i = 0; i < n; ++i) {
            var total = 0;
            for (var j = 0; j < n; ++j)
                if (i != j)
                    total += 1.0 / Math.sqrt(Math.pow(points[3*i] - points[3*j], 2) + Math.pow(points[3*i+1] - points[3*j+1], 2) + Math.pow(points[3*i+2] - points[3*j+2], 2));
            result[i] = total / 2.0;
        }
    };

    var forceKernel = function(points, result, n) {
        var total_x = 0.0;
        var total_y = 0.0;
        var total_z = 0.0;
        for (var i = 0; i < n; ++i) {
            for (var j = 0; j < n; ++j) {
                if (i != j) {
                    var cubed_length = Math.pow(Math.sqrt(Math.pow(points[3*i] - points[3*j], 2) + Math.pow(points[3*i+1] - points[3*j+1], 2) + Math.pow(points[3*i+2] - points[3*j+2], 2)), 3);
                    total_x += (points[3*i] - points[3*j]) / cubed_length;
                    total_y += (points[3*i+1] - points[3*j+1]) / cubed_length;
                    total_z += (points[3*i+2] - points[3*j+2]) / cubed_length;
                }
            }

            result[3*i] = total_x / 2.0;
            result[3*i+1] = total_y / 2.0;
            result[3*i+2] = total_z / 2.0;
        }
    };

    /**
     * Generate random points on a sphere
     *
     */
    var generate = function(points, n) {
        for (var i = 0; i < n; ++i) {
            // generate random points in polar coordinates
            var theta = Math.random() * 2 * Math.PI;
            var u = (Math.random() * 2) - 1;

            // save x, y, and z values
            points[3*i    ] = Math.sqrt(1 - u*u) * Math.cos(theta);
            points[3*i + 1] = Math.sqrt(1 - u*u) * Math.sin(theta);
            points[3*i + 2] = u;
        }
    };

    /**
     * Compute the total energy from a result array
     *
     */
    var energy = function(result, n) {
        var total = 0.0;
        for (var i = 0; i < n; i++)
            total += result[i];

        return total;
    };

    /**
     * Constructor
     *
     */
    var Thomson = function(nPoints) {
        n = nPoints;
        points = new Float32Array(n * 3);
        force = new Float32Array(n * 3);
        part_energy = new Float32Array(n);

        // generate an initial set of random points
        dt = 0.01;
        generate(points, n);
    };

    /**
     * Display output that we have computed so far
     *
     */
    Thomson.prototype.interrupt = function() {
        $('#output').append('<li>Minimum: ' + min + '</li>');
    };

    /**
     * Perform on iteration by generating a random set of points
     *
     */
    Thomson.prototype.run = function(callback) {
        // compute energies for this configuraton
        energyKernel(points, part_energy, n);

        // get energies from GPU, and check if we found a better configuration
        var e = energy(part_energy, n);
        min = Math.min(min, e);

        // compute forces for update step
        forceKernel(points, force, n);

        //
        // compute the step size
        //

        // Determine the maximum squared cross product
        var maxcrossSq = 0;
        for (var j = 0; j < n; ++j) {
            var a = points[3*j+1] * force[3*j+2] - points[3*j+2] * force[3*j+1];
            var b = points[3*j+2] * force[3*j+0] - points[3*j+0] * force[3*j+2];
            var c = points[3*j+0] * force[3*j+1] - points[3*j+1] * force[3*j+0];
            maxcrossSq = Math.max(maxcrossSq, a*a + b*b + c*c);
        }
        var step_size = dt / (n * Math.pow(maxcrossSq, 0.4));

        // update points based on forces
        for (var j = 0; j < n; j++) {
            // shift each point by the product of force and time step
            points[3*j    ] += force[3*j    ] * step_size;
            points[3*j + 1] += force[3*j + 1] * step_size;
            points[3*j + 2] += force[3*j + 2] * step_size;

            // Normalize coordinates
            var length = Math.sqrt(Math.pow(points[3*j    ], 2) +
                                   Math.pow(points[3*j + 1], 2) +
                                   Math.pow(points[3*j + 2], 2));
            points[3*j    ] = points[3*j    ] / length;
            points[3*j + 1] = points[3*j + 1] / length;
            points[3*j + 2] = points[3*j + 2] / length;
        }

        // TODO: Only sync when we hit our stopping condition for the relaxation

        // return points and energy
        callback({
            //points: points,
            score: e
        });
    };

    /**
     * Verify that an input is valid
     *
     */
    Thomson.verify = function(input) {
        return true;
    };

    return Thomson;
})();
