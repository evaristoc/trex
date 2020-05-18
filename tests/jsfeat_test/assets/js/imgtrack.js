////E: getting the webcam
//if (navigator.mediaDevices) {
//  navigator.mediaDevices
//    .getUserMedia({
//      audio: false,
//      video: { width: WIDTH, height: HEIGHT },
//    })
//    .then((stream) => {
//      const video = document.querySelector('video'); //E: get the video element and create a variable called... video
//      video.srcObject = stream;
//      video.onloadedmetadata = function() {
//        //console.log(this);
//        this.play(); //E: originally as video.play(), but apparently video is ALSO a public variable, so I am referring to THIS video
//      };
//    })
//    .catch((err) => {
//      console.log("The following error occurred: " + err.name);
//    });
//}


canvas = document.getElementById('canvas');
canvas.width = WIDTH;
canvas.height = HEIGHT;
ctx = canvas.getContext('2d');
ctx.fillStyle = "rgb(0,255,0)";
ctx.strokeStyle = "rgb(0,255,0)";    

//console.log('HELLO');
try {
  //console.log('HELLO');
    var attempts = 0;
    var readyListener = function(event) {
        findVideoSize();
    };
    var findVideoSize = function() {
        if(video.videoWidth > 0 && video.videoHeight > 0) { //E: if video already there...
            video.removeEventListener('loadeddata', readyListener);
            onDimensionsReady(video.videoWidth, video.videoHeight);
        } else {
            if(attempts < 10) {
                attempts++;
                setTimeout(findVideoSize, 200);
            } else {
                onDimensionsReady(640, 480);
            }
        }
    };
    var onDimensionsReady = function(width, height) {
        demo_app(width, height);
        compatibility.requestAnimationFrame(tick);
    };
    video.addEventListener('loadeddata', readyListener); //E: this already exists implemented in HTML?
    let mob = detectmob();
    let voptions = {}
    if (mob) {
      voptions = { video: { facingMode: { exact: "environment" }, width: WIDTH, height: HEIGHT }, audio:false }
    }else{
      voptions = {video: {width: WIDTH, height: HEIGHT}, audio: false}
    }
    compatibility.getUserMedia(voptions, function(stream) {
        const videoS = document.querySelector('video');
        try {
            videoS.src = compatibility.URL.createObjectURL(stream);
        } catch (error) {
            // E: based on https://github.com/inspirit/jsfeat/issues/84#issuecomment-454933574
            //console.log(videoS);
            videoS.srcObject = stream;
        }
        setTimeout(function() {
                videoS.play();
            }, 500);
    }, function (error) {
        $('#canvas').hide();
        $('#log').hide();
        $('#no_rtc').html('<h4>WebRTC not available.</h4>');
        $('#no_rtc').show();
    });
} catch (error) {
    $('#canvas').hide();
    $('#log').hide();
    $('#no_rtc').html('<h4>Something goes wrong...</h4>');
    $('#no_rtc').show();
}

//E: once the video is set to run or not:
//--- start stats profiler
//--- set as public the point match structure variables - screen_idx, pattern_lev, pattern_idx and distance, using match_t function
var stat = new profiler();


// our point match structure
var match_t = (function () {
    function match_t(screen_idx, pattern_lev, pattern_idx, distance) {
        if (typeof screen_idx === "undefined") { screen_idx=0; }
        if (typeof pattern_lev === "undefined") { pattern_lev=0; }
        if (typeof pattern_idx === "undefined") { pattern_idx=0; }
        if (typeof distance === "undefined") { distance=0; }
        this.screen_idx = screen_idx;
        this.pattern_lev = pattern_lev;
        this.pattern_idx = pattern_idx;
        this.distance = distance;
    }
    return match_t;
})();


//E: then start some additional variables that will be used for rendering and calculation
//--- canvas is set here
//--- screen data is set here
//--- pattern data is set here
//--- matches, homography and match_mask are also set heres
//--- also gui is set here
var gui,options,ctx,canvasWidth,canvasHeight;
var img_u8, img_u8_smooth, screen_corners, num_corners, screen_descriptors;
var pattern_corners, pattern_descriptors, pattern_preview;
var matches, homo3x3, match_mask;
var num_train_levels = 4;


//E: demo_opt is connected to the gui functionality through blur_size, lap_thres, eigen_threshold and train_pattern
//--- train_pattern is a function that takes a picture of the current video, modify it and add to canvas
var demo_opt = function(){
    this.blur_size = 5;
    //E: thresholds are passed as attribute to the yape06 detector before running the detector on images
    //--- they will affect the pyramid comparison made on train_pattern
    //------ the function detect_points
    this.match_threshold = 30;
    
    //E: train pattern will take the train image and do the following:
    //--- takes the setting parameters from gui
    //--- adjust size and data type of train image
    //--- resample it (why??)
    //--- do pyrdown to it ====> Pyramiding
    //------ OJO the process is called "pyramiding":
    //      https://docs.opencv.org/3.1.0/dc/dff/tutorial_py_pyramids.html
    //------ they are Gaussian or Laplacian (lap_thres if for the Laplacian one)
    //--- set the number of corners and configure the keypoints (the for- and while-loops)
    //--- prepare the descriptors matrix
    //--- run the gaussian blur function
    //--- detect the keypoints running the detect_keypoints function
    //--- would find the descriptors running an orb method
    //--- they analysis of pyramids is done by an empirical scaling method of levels (4)
    //------ see for- and while-loops for num_train_levels
    this.train_pattern = function() {
        var lev=0, i=0;
        var sc = 1.0;
        var max_pattern_size = 512;
        var max_per_level = 300; //E: points per level
        var sc_inc = Math.sqrt(2.0); // magic number ;) E: values should be powers of two; we are scaling down
        var lev0_img = new jsfeat.matrix_t(img_u8.cols, img_u8.rows, jsfeat.U8_t | jsfeat.C1_t);
        var lev_img = new jsfeat.matrix_t(img_u8.cols, img_u8.rows, jsfeat.U8_t | jsfeat.C1_t);
        var new_width=0, new_height=0;
        var lev_corners, lev_descr;
        var corners_num=0;
        var sc0 = Math.min(max_pattern_size/img_u8.cols, max_pattern_size/img_u8.rows);
        new_width = (img_u8.cols*sc0)|0;
        new_height = (img_u8.rows*sc0)|0;
        jsfeat.imgproc.resample(img_u8, lev0_img, new_width, new_height);
        // prepare preview
        pattern_preview = new jsfeat.matrix_t(new_width>>1, new_height>>1, jsfeat.U8_t | jsfeat.C1_t);
        jsfeat.imgproc.pyrdown(lev0_img, pattern_preview);
        for(lev=0; lev < num_train_levels; ++lev) {
            pattern_corners[lev] = [];
            lev_corners = pattern_corners[lev];
            // preallocate corners array
            i = (new_width*new_height) >> lev;
            while(--i >= 0) {
                lev_corners[i] = new jsfeat.keypoint_t(0,0,0,0,-1);
            }
            pattern_descriptors[lev] = new jsfeat.matrix_t(32, max_per_level, jsfeat.U8_t | jsfeat.C1_t);
        }
        // do the first level
        lev_corners = pattern_corners[0];
        lev_descr = pattern_descriptors[0];
        jsfeat.imgproc.gaussian_blur(lev0_img, lev_img, options.blur_size|0); // this is more robust
        corners_num = detect_keypoints(lev_img, lev_corners, max_per_level);
        jsfeat.orb.describe(lev_img, lev_corners, corners_num, lev_descr);
        console.log("train " + lev_img.cols + "x" + lev_img.rows + " points: " + corners_num);
        sc /= sc_inc;
        // lets do multiple scale levels
        // we can use Canvas context draw method for faster resize
        // but its nice to demonstrate that you can do everything with jsfeat
        for(lev = 1; lev < num_train_levels; ++lev) {
            lev_corners = pattern_corners[lev];
            lev_descr = pattern_descriptors[lev];
            new_width = (lev0_img.cols*sc)|0;
            new_height = (lev0_img.rows*sc)|0;
            jsfeat.imgproc.resample(lev0_img, lev_img, new_width, new_height);
            jsfeat.imgproc.gaussian_blur(lev_img, lev_img, options.blur_size|0);
            corners_num = detect_keypoints(lev_img, lev_corners, max_per_level);
            jsfeat.orb.describe(lev_img, lev_corners, corners_num, lev_descr);
            // fix the coordinates due to scale level
            for(i = 0; i < corners_num; ++i) {
                lev_corners[i].x *= 1./sc;
                lev_corners[i].y *= 1./sc;
            }
            console.log("train " + lev_img.cols + "x" + lev_img.rows + " points: " + corners_num);
            sc /= sc_inc;
        }
    };
}


//E: this is the demo_app:
//--- here is where the parameters for the functions and transformations (blur, points, etc) are manipulated based on gui and rerun when changed
//--- also the stats variables are set
function demo_app(videoWidth, videoHeight) {
    canvasWidth  = canvas.width;
    canvasHeight = canvas.height;
    ctx = canvas.getContext('2d');
    ctx.fillStyle = "rgb(0,255,0)";
    ctx.strokeStyle = "rgb(0,255,0)";
    img_u8 = new jsfeat.matrix_t(640, 480, jsfeat.U8_t | jsfeat.C1_t);
    // after blur
    img_u8_smooth = new jsfeat.matrix_t(640, 480, jsfeat.U8_t | jsfeat.C1_t);
    // we wll limit to 500 strongest points
    screen_descriptors = new jsfeat.matrix_t(32, 500, jsfeat.U8_t | jsfeat.C1_t);
    pattern_descriptors = [];
    screen_corners = [];
    pattern_corners = [];
    matches = [];
    var i = 640*480;
    while(--i >= 0) {
        screen_corners[i] = new jsfeat.keypoint_t(0,0,0,0,-1);
        matches[i] = new match_t();
    }
    // transform matrix
    //E: homo3x3 and match_mask will be used eventually in the transformation function
    //E: this appears to be the calibration matrix?
    homo3x3 = new jsfeat.matrix_t(3,3,jsfeat.F32C1_t);
    //E: match_mask is required to cover up the area of the target section where good matches were found
    match_mask = new jsfeat.matrix_t(500,1,jsfeat.U8C1_t);
    options = new demo_opt();
    gui = new dat.GUI();
    gui.add(options, "blur_size", 3, 9).step(1);
    gui.add(options, "match_threshold", 16, 128);
    gui.add(options, "train_pattern");
    stat.add("grayscale");
    stat.add("gauss blur");
    stat.add("keypoints");
    stat.add("orb descriptors");
    stat.add("matching");
}


//E: tick:
//--- will control the frames to be analysed; not all frames will be included
//--- here also is where thresholds are implemented for a different keypoint finder - yape06:
//------ laplacian (yape06)
//------ min eigen val (yape06)
//--- yape06 is very fast and lightway, so it can be better for the video/webcam/mobile
//--- once a tick is transformed, it is then a subject of orb and keypoint finding
//--- orb keypoints are also here rendered
//------ OJO render_corners ===>
//--- good matches are selected
//--- a render_mono_image is rendered for eventually showing matches
//------ OJO render_mono_image ===>
//------ OJO match_pattern, find_transform functions ===>
//--- once the good matches are detected, the whole screen is re-rendered to show the lines
var good_matches_num = []

function tick() {
    compatibility.requestAnimationFrame(tick);
    stat.new_frame();
    if (video.readyState === video.HAVE_ENOUGH_DATA) {
        ctx.drawImage(video, 0, 0, 640, 480);
        //ctx.drawImage(foto, 100,100);
        var imageData = ctx.getImageData(0, 0, 640, 480);
        stat.start("grayscale");
        jsfeat.imgproc.grayscale(imageData.data, 640, 480, img_u8);
        stat.stop("grayscale");
        stat.start("gauss blur");
        jsfeat.imgproc.gaussian_blur(img_u8, img_u8_smooth, options.blur_size|0);
        stat.stop("gauss blur");
        jsfeat.fast_corners.set_threshold(options.match_threshold);
        stat.start("keypoints");
        num_corners = detect_keypoints(img_u8_smooth, screen_corners, 500);
        stat.stop("keypoints");
        stat.start("orb descriptors");
        jsfeat.orb.describe(img_u8_smooth, screen_corners, num_corners, screen_descriptors);
        stat.stop("orb descriptors");
        // render result back to canvas
        var data_u32 = new Uint32Array(imageData.data.buffer);
        render_corners(screen_corners, num_corners, data_u32, 640);
        // render pattern and matches
        var num_matches = 0;
        var good_matches = 0;
        if(pattern_preview) {
            render_mono_image(pattern_preview.data, data_u32, pattern_preview.cols, pattern_preview.rows, 640);
            stat.start("matching");
            num_matches = match_pattern();
            good_matches = find_transform(matches, num_matches);
            stat.stop("matching");
        };
        
        ctx.putImageData(imageData, 0, 0);
        
        if(num_matches) {
            render_matches(ctx, matches, num_matches);
            //if(good_matches > 8)
            //    render_pattern_shape(ctx);
            if (good_matches_num.length > 20) {
              good_matches_num.shift();
            };
            if(good_matches > 5){
              good_matches_num.push(1);
            }else{
              good_matches_num.push(0);
              COORDS = [[NaN, NaN, NaN, NaN]];
            };
            if (good_matches_num && good_matches_num.reduce((a,b)=>{return a+b},0)/good_matches_num.length > .5) {
                console.log(good_matches_num);
                render_pattern_shape(ctx);
                //render_hull(ctx, matches, num_matches);
                
              }
            }

        $('#log').html(stat.log());
    }
}


// UTILITIES
//E: apparently ORB is not enough, so yape06 is also used to detect corners
//--- results of yape06, after manipulating thresholds, are sorted by scoring
//--- the scoring is then used to decide good/bad corner points
//--- the angular deviation of the points based on yape06 is then calculated (rotation) TODO check why!!
//--- no much about YAPE on internet; see the following:
//    https://www.spiedigitallibrary.org/conference-proceedings-of-spie/10696/1069616/Modification-of-YAPE-keypoint-detection-algorithm-for-wide-local-contrast/10.1117/12.2310243.short?SSO=1

  //E: a simple average function that I am now using everywhere :)            
  function average(a){
    if (a.length === 0) {
      return
    }else {
      let s = a.reduce((a,b)=>{return a+b}, false);
      return s/a.length;
    }
  }


function detect_keypoints(img, corners, max_allowed) {
    // detect features
    var count = jsfeat.yape06.detect(img, corners, 17);
    // sort by score and reduce the count if needed
    if(count > max_allowed) {
        jsfeat.math.qsort(corners, 0, count-1, function(a,b){return (b.score<a.score);});
        count = max_allowed;
    }
    // calculate dominant orientation for each keypoint
    // E: angles seem to be a requirement for ORB to work? Not explicitly mentioned after calculation
    for(var i = 0; i < count; ++i) {
        corners[i].angle = ic_angle(img, corners[i].x, corners[i].y);
    }
    return count;
}


// central difference using image moments to find dominant orientation
//--- E: Seems to be something in the same line as image gradient (https://en.wikipedia.org/wiki/Image_gradient)
//    but applied on a single (key)point, which would be the center of a circle
//--- NEW EDIT:
//------ according to a course, it looks like "centrality" was measured based on a square (quick but unaccurate) Harris corner?
//--- EDIT:
//--- it has to do with the following:
//------ https://www.youtube.com/watch?v=AAbUfZD_09s <==== excellent description of physics of moments!!
//------ https://www.youtube.com/watch?v=uEVrJrJfa0s
//------ also https://stackoverflow.com/a/22472044; the statistical meaning (https://en.wikipedia.org/wiki/Central_moment) is also important
//--- it is a way to measure translation, rotation and scale
//--- the principle is that the moment would describe the "mass" around a selected point, and how that mass would be expected to affect the momentum of that point; in a complex conditions, calculating the momentum of all points gives a better idea of how the body (or the image) would behave in those conditions 
//--- the author focus on TWO moments: m_01 and m_10
//--- sometimes used as DESCRIPTORS (eg. Hu moments)
//--- here an advanced revisions:
//    http://www.cse.iitm.ac.in/~vplab/courses/CV_DIP/PDF/Feature_Detectors_and_Descriptors.pdf
//    https://www.tugraz.at/fileadmin/user_upload/Institute/ICG/Images/team_lepetit/publications/yi_cvpr16.pdf
//--- OBS: apparently moments NOT THE BEST APPROACH, but the "cheapest" one
var u_max = new Int32Array([15,15,15,15,14,14,14,13,13,12,11,10,9,8,6,3,0]);

function ic_angle(img, px, py) {
    var half_k = 15; // half patch size
    var m_01 = 0, m_10 = 0;
    var src=img.data, step=img.cols;
    var u=0, v=0, center_off=(py*step + px)|0;
    var v_sum=0,d=0,val_plus=0,val_minus=0;
    // Treat the center line differently, v=0
    for (u = -half_k; u <= half_k; ++u) //E: changing the value of u :/
        m_10 += u * src[center_off+u];
    // Go line by line in the circular patch
    for (v = 1; v <= half_k; ++v) {
        // Proceed over the two lines
        v_sum = 0;
        d = u_max[v];
        for (u = -d; u <= d; ++u) {
            val_plus = src[center_off+u+v*step];
            val_minus = src[center_off+u-v*step];
            v_sum += (val_plus - val_minus);
            m_10 += u * (val_plus + val_minus);
        }
        m_01 += v * v_sum;
    }
    return Math.atan2(m_01, m_10);
}


// estimate homography transform between matched points
/*
E: find_transform:
--- according to wikipedia, any two images of the same planar surface in space are related by a homography
    (assuming a pinhole camera model); better to read here
                https://en.wikipedia.org/wiki/Homography_(computer_vision)
--- calculating the homography allows to calculate the perspective of a plane based on at least 4 points
--- RANSAC is an iterative method for estimating a mathematical model from a dataset that contains
    outliers (noise). It estimates outliers and generates a model that is computed without
    the noisy data.
*/
function find_transform(matches, count) {
    // motion kernel
    var mm_kernel = new jsfeat.motion_model.homography2d();
    // ransac params
    var num_model_points = 4;
    var reproj_threshold = 3;
    var ransac_param = new jsfeat.ransac_params_t(num_model_points,
                                                  reproj_threshold, 0.5, 0.99);
    var pattern_xy = [];
    var screen_xy = [];
    // construct correspondences
    for(var i = 0; i < count; ++i) {
        var m = matches[i];
        var s_kp = screen_corners[m.screen_idx];
        var p_kp = pattern_corners[m.pattern_lev][m.pattern_idx];
        pattern_xy[i] = {"x":p_kp.x, "y":p_kp.y};
        screen_xy[i] =  {"x":s_kp.x, "y":s_kp.y};
    }
    // estimate motion
    var ok = false;
    ok = jsfeat.motion_estimator.ransac(ransac_param, mm_kernel,
                                        pattern_xy, screen_xy, count, homo3x3, match_mask, 1000);
    // extract good matches and re-estimate
    var good_cnt = 0;
    if(ok) {
        for(var i=0; i < count; ++i) {
            if(match_mask.data[i]) {
                pattern_xy[good_cnt].x = pattern_xy[i].x;
                pattern_xy[good_cnt].y = pattern_xy[i].y;
                screen_xy[good_cnt].x = screen_xy[i].x;
                screen_xy[good_cnt].y = screen_xy[i].y;
                good_cnt++;
            }
        }
        // run kernel directly with inliers only
        mm_kernel.run(pattern_xy, screen_xy, homo3x3, good_cnt);
    } else {
        jsfeat.matmath.identity_3x3(homo3x3, 1.0);
    }
    return good_cnt;
}


// non zero bits count
//E: operation in bits!!
function popcnt32(n) {
    n -= ((n >> 1) & 0x55555555);
    n = (n & 0x33333333) + ((n >> 2) & 0x33333333);
    return (((n + (n >> 4))& 0xF0F0F0F)* 0x1010101) >> 24;
}


// naive brute-force matching.
// each on screen point is compared to all pattern points  <==== E: !!!! this can be better
// to find the closest match
function match_pattern() {
    var q_cnt = screen_descriptors.rows;
    var query_du8 = screen_descriptors.data;
    var query_u32 = screen_descriptors.buffer.i32; // cast to integer buffer
    var qd_off = 0;
    var qidx=0,lev=0,pidx=0,k=0;
    var num_matches = 0;
    for(qidx = 0; qidx < q_cnt; ++qidx) {
        var best_dist = 256;
        var best_dist2 = 256;
        var best_idx = -1;
        var best_lev = -1;
        for(lev = 0; lev < num_train_levels; ++lev) {
            var lev_descr = pattern_descriptors[lev];
            var ld_cnt = lev_descr.rows;
            var ld_i32 = lev_descr.buffer.i32; // cast to integer buffer
            var ld_off = 0;
            for(pidx = 0; pidx < ld_cnt; ++pidx) {
                var curr_d = 0;
                // our descriptor is 32 bytes so we have 8 Integers
                for(k=0; k < 8; ++k) {
                    curr_d += popcnt32( query_u32[qd_off+k]^ld_i32[ld_off+k] );
                }
                if(curr_d < best_dist) {
                    best_dist2 = best_dist;
                    best_dist = curr_d;
                    best_lev = lev;
                    best_idx = pidx;
                } else if(curr_d < best_dist2) {
                    best_dist2 = curr_d;
                }
                ld_off += 8; // next descriptor
            }
        }
        // filter out by some threshold
        if(best_dist < options.match_threshold) {
            matches[num_matches].screen_idx = qidx;
            matches[num_matches].pattern_lev = best_lev;
            matches[num_matches].pattern_idx = best_idx;
            num_matches++;
        }
        //
        /* filter using the ratio between 2 closest matches
        if(best_dist < 0.8*best_dist2) {
            matches[num_matches].screen_idx = qidx;
            matches[num_matches].pattern_lev = best_lev;
            matches[num_matches].pattern_idx = best_idx;
            num_matches++;
        }
        */
        qd_off += 8; // next query descriptor
    }
    return num_matches;
}


// project/transform rectangle corners with 3x3 Matrix
// E: ok! This is the affine transformation matrix!
// --- find an excellent info at
//      https://en.wikipedia.org/wiki/Affine_transformation
//      https://en.wikipedia.org/wiki/Transformation_matrix (see images!)
//var z=[0.0], px=[0.0], py=[0.0];
function tCorners(M, w, h) {
    var pt = [ {'x':0,'y':0}, {'x':w,'y':0}, {'x':w,'y':h}, {'x':0,'y':h} ];
    var z=0.0, i=0, px=0.0, py=0.0;
    for (; i < 4; ++i) {
        px = M[0]*pt[i].x + M[1]*pt[i].y + M[2];
        py = M[3]*pt[i].x + M[4]*pt[i].y + M[5];
        z = M[6]*pt[i].x + M[7]*pt[i].y + M[8];
        pt[i].x = px/z;
        pt[i].y = py/z;
    }
    return pt;
}


function render_matches(ctx, matches, count) {
    for(var i = 0; i < count; ++i) {
        var m = matches[i];
        var s_kp = screen_corners[m.screen_idx];
        var p_kp = pattern_corners[m.pattern_lev][m.pattern_idx];
        if(match_mask.data[i]) {
            ctx.strokeStyle = "rgb(0,255,0)";
        } else {
            ctx.strokeStyle = "rgb(255,0,0)";
        }
        ctx.beginPath();
        ctx.moveTo(s_kp.x,s_kp.y);
        ctx.lineTo(p_kp.x*0.5, p_kp.y*0.5); // our preview is downscaled
        ctx.lineWidth=1;
        ctx.stroke();
    }
}


var startbox = {x:[],y:[]};
var linesbox = [{x:[],y:[]}, {x:[],y:[]},{x:[],y:[]}, {x:[],y:[]}]
//E: one of the functions from:
//    https://stackoverflow.com/questions/9043805/test-if-two-lines-intersect-javascript-function
var lineSegmentsIntersect = (x1, y1, x2, y2, x3, y3, x4, y4)=> {
    var a_dx = Math.abs(x2 - x1);
    var a_dy = Math.abs(y2 - y1);
    var b_dx = Math.abs(x4 - x3);
    var b_dy = Math.abs(y4 - y3);
    var s = (-a_dy * (x1 - x3) + a_dx * (y1 - y3)) / (-b_dx * a_dy + a_dx * b_dy);
    var t = (+b_dx * (y1 - y3) - b_dy * (x1 - x3)) / (-b_dx * a_dy + a_dx * b_dy);
    return (s >= 0 && s <= 1 && t >= 0 && t <= 1);
}

function median(a){
  if (a.length === 0) {
    return
  }else{
    a.sort((a,b)=>a-b);
    if (a.length%2===0) {
      return (a[a.length/2-1] + a[a.length/2]) / 2 //because it start from 0!!!
    }else{
      return a[(a.length-1)/2] //because it start from 0!!!
    }     
  }
}

function render_pattern_shape(ctx) {
    // get the projected pattern corners
    var coords = [];
    var shape_pts = tCorners(homo3x3.data, pattern_preview.cols*2, pattern_preview.rows*2);
    ctx.strokeStyle = "rgb(0,0,255)";
    ctx.beginPath();
    //E: just a simple adjustment of the box, by using moving averages
    var intersect = false;
    if (lineSegmentsIntersect(shape_pts[0].x,shape_pts[0].y, shape_pts[1].x,shape_pts[1].y, shape_pts[2].x,shape_pts[2].y, shape_pts[3].x,shape_pts[3].y)) {
      intersect = true;
    };
    if (lineSegmentsIntersect(shape_pts[1].x,shape_pts[1].y, shape_pts[2].x,shape_pts[2].y, shape_pts[3].x,shape_pts[3].y, shape_pts[0].x,shape_pts[0].y)) {
      intersect = true;
    };
    
    const avesize = 20;
    
    function cases(v,l){
        let vv;
        switch(v){
            case v < average(l) - 25:
                vv = average(l) - 25;
                break;
            case v > average(l) + 25:
                vv =  average(l) + 25;
                break;
            default:
                vv = v;
        };
        return vv;
    }
    
    if (!intersect) {
      for (let i = 0; i < 4; ++i){
          if (i === 0) {
            if (startbox.x.length < avesize) {
              startbox.x.push(shape_pts[i].x)
            }else{
              let xvertexs = shape_pts[i].x;
              startbox.x.shift()
              //console.log(xvertexs)
              if(xvertexs < average(startbox.x) - 25){
                xvertexs = average(startbox.x) - 25;
              }else if (xvertexs > average(startbox.x) + 25) {
                xvertexs = average(startbox.x) + 25;
              };
              //console.log(xvertexs)
              startbox.x.push(xvertexs)
            };
            if (startbox.y.length < avesize) {
              startbox.y.push(shape_pts[i].y)
            }else{
              let yvertexs = shape_pts[i].y;
              startbox.y.shift()
              //console.log(yvertexs)
              if(yvertexs < average(startbox.y) - 25){
                yvertexs = average(startbox.y) - 25;
              }else if (yvertexs > average(startbox.y) + 25) {
                yvertexs = average(startbox.y) + 25;
              };
              //console.log(yvertexs)
              startbox.y.push(yvertexs)
            }
          };
          if (linesbox[i].x.length < avesize) {
            linesbox[i].x.push(shape_pts[i].x)
          }else{
            let xvertex = cases(shape_pts[i].x, linesbox[i].x);
            linesbox[i].x.shift()
              if(xvertex < average(linesbox[i].x) - 25){
                xvertex = average(linesbox[i].x) - 25;
              }else if (xvertex > average(linesbox[i].x) + 25) {
                xvertex = average(linesbox[i].x) + 25;
              };
            linesbox[i].x.push(xvertex)
          };
          if (linesbox[i].y.length < avesize) {
            linesbox[i].y.push(shape_pts[i].y)
          }else{
            let yvertex = cases(shape_pts[i].y, linesbox[i].y);
            linesbox[i].y.shift()
              if(yvertex < average(linesbox[i].y) - 25){
                yvertex = average(linesbox[i].y) - 25;
              }else if (yvertex > average(linesbox[i].y) + 25) {
                yvertex = average(linesbox[i].y) + 25;
              };
            linesbox[i].y.push(yvertex)
          }

      };
    }

    let findminmaxX = [];
    let findminmaxY = [];
    ctx.moveTo(average(startbox.x),average(startbox.y));
    for(let i = 1; i < 4; ++i){
      ctx.lineTo(average(linesbox[i].x),average(linesbox[i].y));
      findminmaxX.push(average(linesbox[i].x));
      findminmaxY.push(average(linesbox[i].y));
    }
    ctx.lineTo(average(linesbox[0].x),average(linesbox[0].y));
    findminmaxX.push(average(linesbox[0].x));
    findminmaxY.push(average(linesbox[0].y));
    ctx.lineWidth=4;
    ctx.stroke();
    var coords = [];
    //console.log(Math.min(...findminmaxX));
    coords.push(Math.min(...findminmaxX));
    coords.push(Math.min(...findminmaxY));
    coords.push(Math.max(...findminmaxX));
    coords.push(Math.max(...findminmaxY));
    COORDS = []
    COORDS.push(coords)
    //aFrame.coords = coords;
    
}


function render_corners(corners, count, img, step) {
    var pix = (0xff << 24) | (0x00 << 16) | (0xff << 8) | 0x00;
    for(var i=0; i < count; ++i)
    {
        var x = corners[i].x;
        var y = corners[i].y;
        var off = (x + y * step);
        img[off] = pix;
        img[off-1] = pix;
        img[off+1] = pix;
        img[off-step] = pix;
        img[off+step] = pix;
    }
}


function render_mono_image(src, dst, sw, sh, dw) {
    var alpha = (0xff << 24);
    for(var i = 0; i < sh; ++i) {
        for(var j = 0; j < sw; ++j) {
            var pix = src[i*sw+j];
            dst[i*dw+j] = alpha | (pix << 16) | (pix << 8) | pix;
        }
    }
}