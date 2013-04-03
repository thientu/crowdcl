var Thomson = (function() {
    var energyKernel, forceKernel, n, points, force, part_energy, d_force, d_energy, context, start, end;
    var toDeviceTime = 0, partEnergyTime = 0, energyTime = 0, forceTime = 0, forceTransferTime = 0, iterations = 0;
    var energies = [];
    var dt = 1.0;
    var dtLimit = 0.00006;
    var min = Number.MAX_VALUE;
    var lastMeasure = Number.MAX_VALUE;
    var lastEnergy = -Number.MAX_VALUE;
    var lastFell = true;
    var oscillating = false;
    var energyTest = false;

    // kernel for computing the energy on the sphere
    var energyKernelSource = "__kernel void clEnergyKernel(__global float* points, __global float* result, int n) { \
        unsigned int i = get_global_id(0); \
        if (i > n) \
            return; \
\
        float total = 0.0; \
        for (int j = 0; j < n; ++j) \
            if (i != j) \
                total += 1.0 / sqrt(pow(points[3*i] - points[3*j], 2) + pow(points[3*i+1] - points[3*j+1], 2) + pow(points[3*i+2] - points[3*j+ 2], 2)); \
        result[i] = total / 2.0; \
    }";

    // kernel for computing the energy on the sphere
    var forceKernelSource = "__kernel void clForceKernel(__global float* points, __global float* result, int n) { \
        unsigned int i = get_global_id(0); \
        if (i > n) \
            return; \
\
        float total_x = 0.0; \
        float total_y = 0.0; \
        float total_z = 0.0; \
        for (int j = 0; j < n; ++j) { \
            if (i != j) { \
                float cubed_length = pow(sqrt(pow(points[3*i] - points[3*j], 2) + pow(points[3*i+1] - points[3*j+1], 2) + pow(points[3*i+2] - points[3*j+2], 2)), 3); \
                total_x += (points[3*i  ] - points[3*j  ]) / cubed_length; \
                total_y += (points[3*i+1] - points[3*j+1]) / cubed_length; \
                total_z += (points[3*i+2] - points[3*j+2]) / cubed_length; \
            } \
        } \
\
        result[3*i  ] = total_x / 2.0; \
        result[3*i+1] = total_y / 2.0; \
        result[3*i+2] = total_z / 2.0; \
    }";

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

        // connect to gpu
        try {
            context = new KernelContext;

            // compile kernel from source
            energyKernel = context.compile(energyKernelSource, 'clEnergyKernel');
            forceKernel = context.compile(forceKernelSource, 'clForceKernel');
            d_energy = context.toGPU(part_energy);
            d_force = context.toGPU(force);

            // generate an initial set of random points
            generate(points, n);
        } catch (e) {}
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
        // send data to gpu
        start = new Date;
        var d_points = context.toGPU(points);
        end = new Date;
        toDeviceTime += (end - start);

        // compute energies for this configuraton
        var local = Math.min(64, n);
        var global = n;
        start = new Date;
        energyKernel({
            local: local,
            global: global
        }, d_points, d_energy, new Int32(n));
        end = new Date;
        energyTime += (end - start);

        // get energies from GPU, and check if we found a better configuration
        start = new Date;
        context.fromGPU(d_energy, part_energy);
        end = new Date;
        partEnergyTime += (end - start);
        var e = energy(part_energy, n);
        min = Math.min(min, e);

        // compute forces for update step
        start = new Date;
        forceKernel({
            local: local,
            global: global
        }, d_points, d_force, new Int32(n));
        end = new Date;
        forceTime += (end - start);

        // get forces from GPU to update the points
        start = new Date;
        context.fromGPU(d_force, force);
        end = new Date;
        forceTransferTime += (end - start);

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

        // update value for dt
        var currentMeasure = maxcrossSq;
        if (dt > dtLimit) {
            // if maxCrossSq is oscillating, decrease dt
            if (((currentMeasure < lastMeasure) != lastFell) && oscillating) {
                dt *= .90;
                oscillating = false;
            }
            else if ((currentMeasure < lastMeasure) != lastFell) {
                oscillating = true;
            }
            // if maxCrossSq is falling, increase dt
            else if (lastFell) {
                dt *= 1.01;
                oscillating = false;
            }
            else if (!energyTest) {
                lastEnergy = energy;
                energyTest = true;
            }
            // if energy is rising, drop tStep quickly
            else if (energy > lastEnergy) {
                dt *= .5;
                oscillating = false;
                energyTest = false;
            }
            // if energy is falling, increase tStep
            else {
                dt *= 1.1;
                oscillating = false;
                energyTest = false;
            }
        }

        if (iterations % 25 == 0) {
            console.log('To device time: ' + (toDeviceTime / iterations));
            console.log('GPU energy computation: ' + (energyTime / iterations));
            console.log('Energy from device: ' + (partEnergyTime / iterations));
            console.log('GPU force computation: ' + (forceTime / iterations));
            console.log('Force from device: ' + (forceTransferTime / iterations));
        }

        // remember results for this run
        lastFell = currentMeasure < lastMeasure;
        lastMeasure = currentMeasure;
        ++iterations;

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
