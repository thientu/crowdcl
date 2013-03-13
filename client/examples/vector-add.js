var VectorAdd = (function() {
    var kernel, n, tmcl;

    // kernel for adding two vectors
    var source = "__kernel void clVectorAdd(__global unsigned int* a, __global unsigned int* b, __global unsigned int* result, unsigned int width) { \
         unsigned int x = get_global_id(0); \
         if (x >= width) \
           return; \
        result[x] = a[x] + b[x]; \
    }";

    /**
     * Constructor
     *
     */
    function VectorAdd = function(length) {
        // connect to gpu and compile kernel
        n = length;
        tmcl = new TMCL;
        kernel = tmcl.compile(source, 'clVectorAdd');
    };

    /**
     * Interrupt the addition
     *
     */
    VectorAdd.prototype.interrupt = function() {
        alert('Interrupted!');
    };

    /**
     * Add two random vectors
     *
     */
    VectorAdd.prototype.run = function(callback) {
        // generate input vectors with n random values
        var vector1 = new Uint32Array(n);
        var vector2 = new Uint32Array(n);
        var result = new Uint32Array(n);
        for (var i = 0; i < n; i++) {
            vector1[i] = Math.floor(Math.random() * 100);
            vector2[i] = Math.floor(Math.random() * 100);
        }

        // send data to gpu
        var vector1Handle = tmcl.toGPU(vector1);
        var vector2Handle = tmcl.toGPU(vector2)
        var resultHandle = tmcl.toGPU(result);

        // run kernel
        var local = 8;
        var global = Math.ceil(n / local) * local;
        vectorKernel({
            local: local,
            global: global
        }, vector1Handle, vector2Handle, resultHandle, new Uint32(n));

        // get result
        tmcl.fromGPU(resultHandle, result);

        callback({
            vector1: vector1,
            vector2: vector2,
            score: result
        });
    };

    return VectorAdd;
})();