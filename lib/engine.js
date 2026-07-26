// lib/engine.js
// Motor de cálculo PURO (sem DOM, sem window, sem localStorage) para a família
// "Redução de Pressão" (vapor saturado, vapor superaquecido, ar comprimido, água).
// Extraído verbatim de index.html (mesmos números/coeficientes/fórmulas) para
// rodar no servidor, atrás do dispatcher único api/calc.js (Vercel Function).
//
// Origem de cada trecho (linhas do index.html na época da extração):
//  - ENG (tabelas de vapor saturado): linha 1923
//  - VALV (catálogo de válvulas): linha 1925
//  - SCHED (diâmetros internos por schedule): linhas 1934-1935
//  - CVANG / CVANG_DEG (curva Cv x ângulo, borboletas): linhas 1945-1946
//  - VB_PT (pressão x temperatura, borboletas VB-121/122): linha 1975
//  - AGUA_MODELS: linha 2921
//  - interp / interpC: linhas 1979-2004
//  - vaporTemp / vaporVol / vaporPress: linhas 2005-2007
//  - ATM: linha 2009
//  - cvReq, parseInch, vaporVolWet, sortedSizes, pmaxValv, aberturaFrac: linhas 2487-2510
//  - steamLookup: linha 4035
//  - valveAbas: linha 2939
//  - IIFE que injeta as borboletas wafer VB-2000/VB-2500/VB-5500 em VALV/CVANG e
//    marca _abas:["agua"] em VDB para essas 3 (portanto NÃO aparecem na aba 'vapor'):
//    linhas 2960-2971

/* ---------- tabelas de propriedades (verbatim) ---------- */
const ENG = {"steam": {"T_C": [0.01, 4.0, 5.0, 6.0, 8.0, 10.0, 11.0, 12.0, 13.0, 14.0, 15.0, 16.0, 17.0, 18.0, 19.0, 20.0, 21.0, 22.0, 23.0, 24.0, 25.0, 26.0, 27.0, 28.0, 29.0, 30.0, 31.0, 32.0, 33.0, 34.0, 35.0, 36.0, 38.0, 40.0, 45.0, 50.0, 55.0, 60.0, 65.0, 70.0, 75.0, 80.0, 85.0, 90.0, 95.0, 100.0, 110.0, 120.0, 130.0, 140.0, 150.0, 160.0, 170.0, 180.0, 190.0, 200.0, 210.0, 220.0, 230.0, 240.0, 250.0, 260.0, 270.0, 280.0, 290.0, 300.0, 320.0, 324.8, 330.9, 336.8, 340.0, 342.2, 347.4, 352.4, 357.1, 360.0, 361.5, 365.8, 374.14], "P_bara": [0.00611, 0.00813, 0.00872, 0.00935, 0.01072, 0.01228, 0.01312, 0.01402, 0.01497, 0.01598, 0.01705, 0.01818, 0.01938, 0.02064, 0.02198, 0.02339, 0.02487, 0.02645, 0.0281, 0.02985, 0.03169, 0.03363, 0.03567, 0.03782, 0.04008, 0.04246, 0.04496, 0.04759, 0.05034, 0.05324, 0.05628, 0.05947, 0.06632, 0.07384, 0.09593, 0.1235, 0.1576, 0.1994, 0.2503, 0.3119, 0.3858, 0.4739, 0.5783, 0.7014, 0.8455, 1.014, 1.433, 1.985, 2.701, 3.613, 4.758, 6.178, 7.917, 10.02, 12.54, 15.54, 19.06, 23.18, 27.95, 33.44, 39.73, 46.88, 54.99, 64.12, 74.36, 85.81, 112.7, 120.0, 130.0, 140.0, 145.9, 150.0, 160.0, 170.0, 180.0, 186.5, 190.0, 200.0, 220.9], "vV_m3kg": [206.136, 157.232, 147.12, 137.734, 120.917, 106.379, 99.857, 93.784, 88.124, 82.848, 77.926, 73.333, 69.044, 65.038, 61.293, 57.791, 54.514, 51.447, 48.574, 45.883, 43.36, 40.994, 38.774, 36.69, 34.733, 32.894, 31.165, 29.54, 28.011, 26.571, 25.216, 23.94, 21.602, 19.523, 15.258, 12.032, 9.568, 7.671, 6.197, 5.042, 4.131, 3.407, 2.828, 2.361, 1.982, 1.673, 1.21, 0.8919, 0.6685, 0.5089, 0.3928, 0.3071, 0.2428, 0.1941, 0.1565, 0.1274, 0.1044, 0.08619, 0.07158, 0.05976, 0.05013, 0.04221, 0.03564, 0.3017, 0.02557, 0.02167, 0.01549, 0.01426, 0.01278, 0.01149, 0.0108, 0.01034, 0.009306, 0.00864, 0.007489, 0.006945, 0.006657, 0.005834, 0.003155], "vL_mm3kg": [1.0002, 1.0001, 1.0001, 1.0001, 1.0002, 1.0004, 1.0004, 1.0005, 1.0007, 1.0008, 1.0009, 1.0011, 1.0012, 1.0014, 1.0016, 1.0018, 1.002, 1.0022, 1.0024, 1.0027, 1.0029, 1.0032, 1.0035, 1.0037, 1.004, 1.0043, 1.0046, 1.005, 1.0053, 1.0056, 1.006, 1.0063, 1.0078, 1.0078, 1.0099, 1.0121, 1.0146, 1.0172, 1.0199, 1.0228, 1.0259, 1.0291, 1.0325, 1.036, 1.0397, 1.0435, 1.0516, 1.0603, 1.0697, 1.0797, 1.0905, 1.102, 1.1143, 1.1274, 1.1414, 1.1565, 1.01726, 1.19, 1.2088, 1.2291, 1.2512, 1.2755, 1.3023, 1.3321, 1.356, 1.4036, 1.4988, 1.5267, 1.5671, 1.6107, 1.6379, 1.6581, 1.7107, 1.7702, 1.8397, 1.8925, 1.9243, 2.036, 3.155], "hL_kJkg": [0.01, 16.78, 20.98, 25.2, 33.6, 42.01, 46.2, 50.41, 54.6, 58.8, 62.99, 67.19, 71.38, 75.58, 79.77, 83.96, 88.14, 92.33, 96.52, 100.7, 104.89, 109.07, 113.25, 117.43, 121.61, 125.79, 129.97, 134.15, 138.33, 142.5, 146.68, 150.86, 159.21, 167.57, 188.45, 209.33, 230.23, 251.13, 272.06, 292.98, 313.93, 334.91, 355.9, 376.92, 397.96, 419.04, 461.3, 503.71, 546.31, 589.13, 632.2, 675.55, 719.21, 763.22, 807.62, 852.45, 897.76, 943.62, 990.12, 1037.3, 1085.4, 1134.4, 1184.5, 1236.0, 1289.1, 1344.0, 1461.5, 1491.3, 1531.5, 1571.1, 1594.2, 1610.5, 1650.1, 1690.3, 1732.0, 1760.5, 1776.5, 1826.3, 2099.3], "hV_kJkg": [2501.4, 2508.7, 2510.6, 2512.4, 2516.1, 2519.8, 2521.6, 2523.4, 2525.3, 2527.1, 2528.9, 2530.8, 2532.6, 2534.4, 2536.2, 2538.1, 2539.9, 2541.7, 2543.5, 2545.4, 2547.2, 2549.0, 2550.8, 2552.6, 2554.5, 2556.3, 2558.1, 2559.9, 2561.7, 2563.5, 2565.3, 2567.1, 2570.7, 2574.3, 2583.2, 2592.1, 2600.9, 2609.6, 2618.3, 2626.8, 2635.3, 2643.7, 2651.9, 2660.1, 2668.1, 2676.1, 2691.5, 2706.3, 2720.5, 2733.9, 2746.5, 2758.1, 2768.7, 2778.2, 2786.4, 2793.2, 2798.5, 2802.1, 2804.0, 2803.8, 2801.5, 2796.6, 2789.7, 2779.6, 2766.2, 2749.0, 2700.1, 2684.9, 2662.2, 2637.6, 2622.0, 2610.5, 2580.6, 2547.2, 2509.1, 2481.0, 2464.5, 2409.7, 2099.3]}, "water": {"T_C": [0.0, 1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 7.0, 8.0, 9.0, 10.0, 11.0, 12.0, 13.0, 14.0, 15.0, 16.0, 17.0, 18.0, 19.0, 20.0, 21.0, 22.0, 23.0, 24.0, 25.0, 26.0, 27.0, 28.0, 29.0, 30.0, 31.0, 32.0, 33.0, 34.0, 35.0, 36.0, 37.0, 38.0, 39.0, 40.0, 41.0, 42.0, 43.0, 44.0, 45.0, 46.0, 47.0, 48.0, 49.0, 50.0, 51.0, 52.0, 53.0, 54.0, 55.0, 56.0, 57.0, 58.0, 59.0, 60.0, 61.0, 62.0, 63.0, 64.0, 65.0, 66.0, 67.0, 68.0, 69.0, 70.0, 71.0, 72.0, 73.0, 74.0, 75.0, 76.0, 77.0, 78.0, 79.0, 80.0, 81.0, 82.0, 83.0, 84.0, 85.0, 86.0, 87.0, 88.0, 89.0, 90.0, 91.0, 92.0, 93.0, 94.0, 95.0, 96.0, 97.0, 98.0, 99.0, 100.0], "rho_kgm3": [999.84, 999.9, 999.94, 999.97, 999.97, 999.97, 999.94, 999.9, 999.85, 999.78, 999.7, 999.61, 999.5, 999.38, 999.25, 999.1, 998.94, 998.78, 998.6, 998.41, 998.2, 997.99, 997.77, 997.54, 997.3, 997.04, 996.78, 996.51, 996.23, 995.94, 995.65, 995.34, 995.02, 994.7, 994.37, 994.03, 993.68, 993.33, 992.96, 992.59, 992.21, 991.83, 991.43, 991.03, 990.62, 990.21, 989.79, 989.36, 988.92, 988.48, 988.03, 987.57, 987.11, 986.64, 986.17, 985.69, 985.2, 984.71, 984.21, 983.7, 983.19, 982.67, 982.15, 981.62, 981.09, 980.54, 980.0, 979.45, 978.89, 978.33, 977.76, 977.18, 976.61, 976.02, 975.43, 974.84, 974.24, 973.63, 973.02, 972.4, 971.78, 971.16, 970.53, 969.89, 969.25, 968.6, 967.95, 967.3, 966.64, 965.97, 965.3, 964.63, 963.95, 963.26, 962.57, 961.88, 961.18, 960.48, 959.77, 959.06, 958.63]}, "valvSeg": {"bocal": ["15/25", "20/32", "25/40", "32/50", "40/65", "50/80", "65/100", "80/125", "100/150", "125/200", "150/250", "200/300", "250/350", "15/20", "20/25", "25/32"], "d0_mm": [13.0, 18.0, 22.5, 29.0, 36.0, 45.0, 58.5, 72.0, 90.0, 106.0, 125.0, 165.0, 200.0, 12.0, 15.0, 18.0], "A0_mm2": [133.0, 254.0, 398.0, 661.0, 1018.0, 1590.0, 2688.0, 4072.0, 6362.0, 8825.0, 12272.0, 21382.0, 31416.0, 113.0, 177.0, 254.0], "kdr_vapor": [[0.2, 0.56, 0.57, 0.51, 0.58, 0.5, 0.0, 0.0, 0.53], [0.3, 0.57, 0.59, 0.52, 0.58, 0.51, 0.46, 0.4, 0.55], [0.4, 0.59, 0.61, 0.54, 0.59, 0.52, 0.47, 0.42, 0.57], [0.5, 0.6, 0.63, 0.55, 0.6, 0.54, 0.49, 0.44, 0.58], [0.6, 0.61, 0.64, 0.56, 0.61, 0.55, 0.51, 0.46, 0.6], [0.7, 0.63, 0.66, 0.57, 0.62, 0.56, 0.53, 0.47, 0.61], [0.8, 0.64, 0.68, 0.58, 0.63, 0.57, 0.54, 0.48, 0.63], [0.9, 0.65, 0.69, 0.59, 0.64, 0.58, 0.55, 0.5, 0.64], [1.0, 0.66, 0.7, 0.6, 0.65, 0.59, 0.56, 0.51, 0.65], [1.2, 0.68, 0.73, 0.62, 0.66, 0.61, 0.58, 0.53, 0.67], [1.5, 0.7, 0.75, 0.65, 0.68, 0.64, 0.6, 0.54, 0.7], [1.6, 0.7, 0.68, 0.65, 0.68, 0.64, 0.6, 0.55, 0.7], [1.8, 0.71, 0.69, 0.66, 0.69, 0.66, 0.61, 0.56, 0.72], [2.0, 0.72, 0.7, 0.67, 0.7, 0.67, 0.62, 0.57, 0.73], [2.5, 0.73, 0.72, 0.68, 0.72, 0.69, 0.63, 0.58, 0.74], [3.0, 0.73, 0.73, 0.69, 0.73, 0.7, 0.63, 0.59, 0.74], [3.5, 0.74, 0.74, 0.7, 0.74, 0.7, 0.64, 0.6, 0.75], [3.5, 0.74, 0.74, 0.7, 0.74, 0.7, 0.64, 0.6, 0.75], [4.0, 0.74, 0.74, 0.7, 0.75, 0.7, 0.64, 0.6, 0.75]], "kdr_agua_911": [0.52, 0.54, 0.48, 0.45, 0.56, 0.52], "kdr_agua_943": [[0.0, 0.0, 0.53], [0.45, 0.42, 0.53]], "overpressure_default": 10, "k_vapor": 1.135}};

const VALV = {"32470": {"PMax_barg": 13.0, "sizes": {"1": 11.8, "1.1/2": 29.4, "2": 47.1, "3": 117.7, "4": 188.2, "6": 470.6, "8": 741.2}, "curso": {"1": 20.0, "1.1/2": 30.0, "2": 30.0, "3": 30.0, "4": 30.0, "6": 50.0, "8": 65.0}}, "12440": {"PMax_barg": 12.0, "sizes": {"1/2": 4.7, "3/4": 7.4, "1": 11.8, "1.1/4": 18.8, "1.1/2": 29.4, "2": 47.1, "2.1/2": 74.1, "3": 117.7, "4": 188.2, "6": 470.6, "8": 741.2, "10": 1176.5}, "curso": {"1": 20.0, "1.1/2": 20.0, "1.1/4": 20.0, "1/2": 20.0, "2": 20.0, "2.1/2": 30.0, "3": 30.0, "3/4": 20.0, "4": 30.0, "5": 50.0, "6": 50.0, "8": 65.0}}, "45440": {"PMax_barg": 40.0, "sizes": {"1/2": 3.9, "3/4": 6.3, "1": 9.8, "1.1/4": 15.0, "1.1/2": 23.4, "2": 33.2}, "curso": {"1": 20.0, "1.1/2": 20.0, "1.1/4": 20.0, "1/2": 20.0, "2": 20.0, "3/4": 20.0}}, "35470": {"PMax_barg": 41.0, "sizes": {"1": 11.8, "1.1/2": 29.5, "2": 47.2, "3": 118.0, "4": 188.8, "6": 468.0, "8": 743.4}, "curso": {"1": 20.0, "1.1/2": 30.0, "2": 30.0, "3": 30.0, "4": 30.0, "6": 50.0, "8": 65.0}}, "32448": {"PMax_barg": 12.0, "sizes": {"1/2": 4.7, "3/4": 7.4, "1": 11.7, "1.1/4": 18.8, "1.1/2": 29.3, "2": 46.8, "2.1/2": 73.7, "3": 117.0, "4": 187.2}, "curso": {"1": 10.0, "1.1/2": 15.0, "1.1/4": 15.0, "1/2": 10.0, "2": 15.0, "2.1/2": 20.0, "3": 25.0, "3/4": 10.0, "4": 30.0}}, "12701": {"PMax_barg": 12.0, "sizes": {"1/2": 3.76, "3/4": 5.9, "1": 9.41, "1.1/4": 14.71, "1.1/2": 23.53, "2": 37.65, "2.1/2": 58.82, "3": 94.18, "4": 147.06}, "curso": {"1": 6.0, "1.1/2": 8.0, "1.1/4": 8.0, "1/2": 4.0, "2": 10.0, "2.1/2": 11.0, "3": 13.0, "3/4": 5.0, "4": 16.0, "5": 19.0, "6": 22.0}}, "H-3600": {"PMax_barg": 11.0, "sizes": {"1/2": 5.49, "3/4": 11.09, "1": 21.13, "1.1/4": 26.97, "1.1/2": 38.41, "2": 61.64, "2.1/2": 95.73}}, "RE1": {"PMax_barg": 16.0, "sizes": {"1/2": 0.7, "3/4": 1.05, "1": 1.83}}, "VRB41": {"PMax_barg": 16.0, "sizes": {"1/2": 3.3, "3/4": 6.4, "1": 9.5, "1.1/4": 14.0, "1.1/2": 19.9, "2": 32.8, "2.1/2": 53.2, "3": 70.3, "4": 109.2, "5": 170.8, "6": 210.6, "8": 351.0}, "curso": {"1": 160.0, "1.1/2": 200.0, "1.1/4": 180.0, "1/2": 147.0, "2": 230.0, "2.1/2": 250.0, "3": 310.0, "3/4": 154.0, "4": 350.0}}, "H-3601": {"PMax_barg": 41, "sizes": {"1/2": 5.148, "3/4": 9.126, "1": 13.923, "1.1/2": 28.665, "2": 47.619}}, "VB-121": {"PMax_barg": 20, "sizes": {"2": 128.0, "2.1/2": 149.0, "3": 206.0, "4": 386.0, "5": 736.0, "6": 1175.0, "8": 2290.0, "10": 3558.0}}, "VB-122": {"PMax_barg": 20, "sizes": {"3": 165.0, "4": 400.0, "6": 1050.0, "8": 1800.0, "10": 3150.0}}};

const SCHED = {"40": {"1/8": 6.84, "1/4": 9.25, "3/8": 12.52, "1/2": 15.8, "3/4": 20.93, "1": 26.64, "1.1/4": 35.05, "1.1/2": 40.89, "2": 52.5, "2.1/2": 62.71, "3": 77.93, "4": 102.26, "5": 128.19, "6": 154.05, "8": 202.72, "10": 254.51, "12": 303.23, "14": 333.34, "16": 381.0, "18": 428.66, "20": 477.82, "24": 574.65}, "80": {"1/8": 5.46, "1/4": 7.66, "3/8": 10.7, "1/2": 13.86, "3/4": 18.85, "1": 24.31, "1.1/4": 32.46, "1.1/2": 38.1, "2": 49.25, "2.1/2": 59.0, "3": 73.66, "4": 97.18, "5": 122.25, "6": 146.33, "8": 193.68, "10": 242.82, "12": 288.95, "14": 317.5, "16": 363.52, "18": 409.55, "20": 455.62, "24": 547.69}};
Object.assign(SCHED,{"5":{"1/8": 7.81, "1/4": 10.42, "3/8": 13.85, "1/2": 18.04, "3/4": 23.37, "1": 30.1, "1.1/4": 38.86, "1.1/2": 44.96, "2": 57.03, "2.1/2": 68.81, "3": 84.68, "4": 110.08, "5": 135.76, "6": 162.74, "8": 213.54, "10": 266.25, "12": 315.93, "14": 347.68, "16": 398.02, "18": 448.82, "20": 498.44, "24": 598.52},"10":{"1/8": 7.81, "1/4": 10.42, "3/8": 13.85, "1/2": 17.12, "3/4": 22.45, "1": 27.86, "1.1/4": 36.62, "1.1/2": 42.72, "2": 54.79, "2.1/2": 66.93, "3": 82.8, "4": 108.2, "5": 134.5, "6": 161.48, "8": 211.56, "10": 264.67, "12": 314.71, "14": 346.04, "16": 396.84, "18": 447.64, "20": 496.92, "24": 596.9}});

const CVANG = {"VB-121": {"2": [3, 7, 17, 27, 41, 63, 85, 106, 128], "2.1/2": [4, 9, 21, 35, 55, 80, 104, 135, 149], "3": [7, 19, 40, 62, 97, 134, 166, 194, 206], "4": [9, 30, 62, 98, 147, 223, 308, 368, 386], "5": [15, 50, 96, 162, 260, 384, 500, 637, 736], "6": [38, 93, 163, 267, 415, 607, 813, 1047, 1175], "8": [75, 135, 305, 510, 750, 1110, 1537, 2006, 2290], "10": [92, 250, 495, 770, 1125, 1670, 2346, 2980, 3558]}, "VB-122": {"3": [5, 14, 25, 36, 51, 74, 114, 145, 165], "4": [13, 35, 60, 88, 123, 178, 276, 351, 400], "6": [34, 92, 157, 232, 323, 468, 726, 923, 1050], "8": [60, 157, 270, 397, 554, 802, 1245, 1582, 1800], "10": [104, 275, 472, 695, 970, 1404, 2178, 2769, 3150]}};
const CVANG_DEG = [10, 20, 30, 40, 50, 60, 70, 80, 90];

const VB_PT = {"VB-121": [[38, 19.6], [100, 17.7], [150, 15.8], [200, 13.8], [250, 12.1]], "VB-122": [[38, 51.1], [100, 46.6], [150, 45.1], [200, 43.8], [250, 41.9]]};

let AGUA_MODELS = ["12440","32448","32470","35470","45440","H-3600","H-3601","VB-121","VB-122"];

// VDB minimalista: no index.html o objeto completo carrega textos/imagens da UI
// (não necessários para o cálculo). O único campo relevante para o cálculo é
// "_abas", usado por valveAbas() para decidir em quais abas cada modelo aparece.
// A IIFE abaixo (verbatim quanto à lógica) replica o que index.html faz: injeta
// as borboletas wafer VB-2000/VB-2500/VB-5500 em VALV/CVANG e marca essas 3 como
// exclusivas da aba "agua" (portanto elas NÃO entram na aba "vapor").
const VDB = {};
(function () {
  const _wsizes = {"1.1/2": 64, "2": 86, "2.1/2": 170, "3": 280, "4": 530, "5": 750, "6": 1580, "8": 2650, "10": 4000, "12": 7350};
  const _wcvang = {"1.1/2": [0.5, 3.9, 9.0, 16, 25, 41, 56, 62, 64], "2": [0.6, 5.1, 12, 21, 34, 56, 76, 84, 86], "2.1/2": [3.4, 9.7, 22, 36, 59, 88, 116, 154, 170], "3": [4.8, 13, 27, 50, 81, 127, 209, 259, 280], "4": [6.4, 22, 44, 82, 159, 271, 406, 503, 530], "5": [7.6, 26, 60, 104, 183, 285, 444, 626, 750], "6": [14, 55, 124, 221, 351, 590, 928, 1418, 1580], "8": [21, 87, 220, 403, 665, 1073, 1676, 2423, 2650], "10": [44, 200, 416, 699, 1129, 1749, 2499, 3828, 4000], "12": [56, 227, 516, 916, 1411, 2289, 3684, 5793, 7350]};
  ['VB-2000', 'VB-2500', 'VB-5500'].forEach(function (m) {
    VALV[m] = { PMax_barg: 16, sizes: Object.assign({}, _wsizes) };
    CVANG[m] = JSON.parse(JSON.stringify(_wcvang));
    if (!AGUA_MODELS.includes(m)) AGUA_MODELS.push(m);
    VDB[m] = { _abas: ["agua"] };
  });
})();

/* ---------- helpers de interpolação (verbatim) ---------- */
function interp(xs, ys, x) {
  if (x <= xs[0]) return ys[0];
  if (x >= xs[xs.length - 1]) return ys[ys.length - 1];
  for (let i = 0; i < xs.length - 1; i++) if (xs[i] <= x && x <= xs[i + 1]) { const f = (x - xs[i]) / (xs[i + 1] - xs[i]); return ys[i] + (ys[i + 1] - ys[i]) * f; }
  return ys[ys.length - 1];
}
function interpC(xs, ys, x) {
  const n = xs.length;
  if (n < 3) return interp(xs, ys, x);
  if (x <= xs[0]) return ys[0];
  if (x >= xs[n - 1]) return ys[n - 1];
  let k = 0; while (k < n - 1 && x > xs[k + 1]) k++;
  const H = i => xs[i + 1] - xs[i], D = i => (ys[i + 1] - ys[i]) / (xs[i + 1] - xs[i]);
  const slope = i => {
    if (i <= 0) return D(0);
    if (i >= n - 1) return D(n - 2);
    const dm = D(i - 1), dp = D(i);
    if (dm * dp <= 0) return 0;
    const hm = H(i - 1), hp = H(i), w1 = 2 * hp + hm, w2 = hp + 2 * hm;
    return (w1 + w2) / (w1 / dm + w2 / dp);
  };
  const x0 = xs[k], x1 = xs[k + 1], y0 = ys[k], y1 = ys[k + 1], h = x1 - x0, t = (x - x0) / h;
  const m0 = slope(k), m1 = slope(k + 1);
  const t2 = t * t, t3 = t2 * t;
  const h00 = 2 * t3 - 3 * t2 + 1, h10 = t3 - 2 * t2 + t, h01 = -2 * t3 + 3 * t2, h11 = t3 - t2;
  return h00 * y0 + h10 * h * m0 + h01 * y1 + h11 * h * m1;
}

const vaporVol = b => interpC(ENG.steam.P_bara, ENG.steam.vV_m3kg, b + 1.0);
const vaporTemp = b => interpC(ENG.steam.P_bara, ENG.steam.T_C, b + 1.0);
const vaporPress = Tc => interpC(ENG.steam.T_C, ENG.steam.P_bara, Tc); // pressão de saturação, bar(abs)

const ATM = 1.01325;

/* ---------- redução de pressão (verbatim, linhas ~2487-2510 do index.html) ---------- */
function cvReq(P1, P2, mp) { return (P1 - P2 < 0.42 * P1) ? mp / (11.92 * Math.sqrt((P1 - P2) * (P1 + P2 + 2))) : mp / (9.6 * (P1 + 1)); }
function parseInch(s) { if (s.indexOf('.') >= 0) { const [a, b] = s.split('.'); const [n, d] = b.split('/'); return +a + (+n) / (+d); } if (s.indexOf('/') >= 0) { const [n, d] = s.split('/'); return (+n) / (+d); } return +s; }
// volume específico do vapor úmido conforme título (xf em fração 0-1): v = vL + x·(vV − vL)
function vaporVolWet(barg, xf) { const r = steamLookup(barg); const vV = r.vV, vL = r.vL / 1000; return vL + xf * (vV - vL); }
function sortedSizes(md) { return Object.entries(md.sizes).sort((a, b) => parseInch(a[0]) - parseInch(b[0])); }
// Pmáx admissível: borboletas (VB) variam com a temperatura (tabela pressão-temperatura)
function pmaxValv(modelo, tempC) {
  const t = VB_PT[modelo];
  if (t && t.length) {
    if (tempC <= t[0][0]) return t[0][1];
    if (tempC >= t[t.length - 1][0]) return t[t.length - 1][1];
    for (let i = 1; i < t.length; i++) { if (tempC <= t[i][0]) { const a = t[i - 1], b = t[i]; return a[1] + (b[1] - a[1]) * (tempC - a[0]) / (b[0] - a[0]); } }
  }
  return (VALV[modelo] && VALV[modelo].PMax_barg);
}
function aberturaFrac(modelo, sz, cvReqVal, cvFull) {
  const tab = CVANG[modelo] && CVANG[modelo][sz];
  if (tab) {
    const ang = CVANG_DEG;
    if (cvReqVal <= tab[0]) return ang[0] / 90;
    if (cvReqVal >= tab[tab.length - 1]) return 1;
    for (let i = 0; i < tab.length - 1; i++) { if (cvReqVal >= tab[i] && cvReqVal <= tab[i + 1]) { const t = (cvReqVal - tab[i]) / (tab[i + 1] - tab[i]); return (ang[i] + t * (ang[i + 1] - ang[i])) / 90; } }
    return 1;
  }
  return Math.log(cvReqVal / cvFull) / Math.log(50) + 1; // globo equal-% (rangeabilidade 50)
}

// abas em que o modelo aparece (padrão; sobrescrevível no cadastro -> VDB[modelo]._abas)
// (verbatim, linha ~2939 do index.html)
function valveAbas(m) {
  const o = VDB[m] && VDB[m]._abas;
  if (Array.isArray(o) && o.length) return o;
  const a = ['vapor', 'vaporsup', 'ar'];
  if (AGUA_MODELS.includes(m)) a.push('agua');
  return a;
}
// No cliente, isAtivo() também filtra por modelos desativados no cadastro local
// (estado do navegador). No servidor NÃO replicamos esse filtro (ver instruções) —
// modelsForTabAll() devolve todos os modelos de VALV que atendem a aba, e o
// endpoint usa a lista `activeModels` vinda do cliente quando ela é informada.
function modelsForTabAll(tab) {
  return Object.keys(VALV).filter(m => valveAbas(m).includes(tab));
}

/* ---------- propriedades do vapor saturado (verbatim, linha ~4035 do index.html) ---------- */
function steamLookup(barg) {
  const Pa = barg + ATM;
  const T = interpC(ENG.steam.P_bara, ENG.steam.T_C, Pa);
  const vV = interpC(ENG.steam.P_bara, ENG.steam.vV_m3kg, Pa);
  const vL = interpC(ENG.steam.P_bara, ENG.steam.vL_mm3kg, Pa);
  const hL = ENG.steam.hL_kJkg ? interpC(ENG.steam.P_bara, ENG.steam.hL_kJkg, Pa) : null;
  const hV = ENG.steam.hV_kJkg ? interpC(ENG.steam.P_bara, ENG.steam.hV_kJkg, Pa) : null;
  const lat = (hL != null && hV != null) ? (hV - hL) : null; // kJ/kg
  return { Pa, T, vV, vL, roV: 1 / vV, roL: 1000 / vL, lat };
}

/* ---------- computeReduc: motor do endpoint /api/reduc ---------- */
// Replica EXATAMENTE:
//  - MB.reduc.compute() (linhas ~2607-2626 do index.html) para CVp/regime/models/rows
//  - renderVelTable() (linha ~2692) para a tabela de velocidade
export function computeReduc({ pin, pout, flow, sch, x, activeModels } = {}) {
  pin = Number(pin);
  pout = Number(pout);
  flow = Number(flow);

  let err = null;
  if (pin <= pout) err = "Pressão de entrada deve ser maior que a de saída.";
  else if (flow <= 0) err = "Vazão deve ser maior que 0.";

  // tempIn/tempOut e regime são calculados sempre (mesmo com err), como no index.html
  const tempIn = vaporTemp(pin);
  const tempOut = vaporTemp(pout);
  const regime = (pin - pout < 0.42 * pin) ? "Subcrítico" : "Crítico";

  const CVp = err ? 0 : cvReq(pin, pout, flow);
  const kv = CVp * 0.865;

  const models = [];
  if (!err) {
    // Se o cliente mandar activeModels (mesmo array vazio = nenhum modelo ativo),
    // essa lista é autoritativa. Só cai no "todos os modelos" quando o campo
    // não foi enviado (undefined/null), conforme instrução do piloto.
    const list = Array.isArray(activeModels)
      ? activeModels.filter(m => VALV[m] && valveAbas(m).includes('vapor'))
      : modelsForTabAll('vapor');
    const _dpC = pin - pout;
    for (const modelo of list) {
      const md = VALV[modelo];
      if (!md) continue;
      const pmAdm = pmaxValv(modelo, tempIn);
      const excede = pmAdm != null && pin > pmAdm;
      const m = { modelo, pmAdm: (pmAdm == null ? null : pmAdm), excede, rows: [] };
      if (!excede) {
        m.rows = sortedSizes(md).map(([sz, cvv]) => {
          const Q = (flow / CVp) * cvv;
          const ab = aberturaFrac(modelo, sz, CVp, cvv);
          const _dm = (md.dpmax && md.dpmax[sz]);
          const dpOver = (_dm != null && _dm !== "" && _dpC > Number(_dm));
          return { sz, cvv, rcv: CVp / cvv, Q, ab, dpOver, dpm: (_dm == null || _dm === "") ? null : _dm };
        });
      }
      models.push(m);
    }
  }

  // ---- tabela de velocidade (renderVelTable, linha ~2692) ----
  let vel = [];
  if (!err) {
    const D = SCHED[sch] || SCHED['40'];
    const xpct = (x == null || isNaN(Number(x))) ? 100 : Number(x);
    const xf = Math.min(Math.max((xpct > 1 ? xpct / 100 : xpct), 0), 1);
    const order = Object.keys(D).sort((a, b) => parseInch(a) - parseInch(b));
    vel = order.map(sz => {
      const id = D[sz];
      const A = Math.PI / 4 * Math.pow(id / 1000, 2);
      const vin = (flow / 3600) * vaporVolWet(pin, xf) / A;
      const vout = (flow / 3600) * vaporVolWet(pout, xf) / A;
      return { sz, vin, vout };
    });
  }

  return { err, CVp, regime, tempIn, tempOut, kv, models, vel };
}

/* =========================================================================
 * FAMÍLIA DE REDUÇÃO — vapor superaquecido / ar comprimido / água
 * Extraído verbatim de index.html (linhas na época da extração desta parte):
 *  - isBorboleta: linha 2515
 *  - vaporVolSup, khSup: linhas 2733-2734 (renderReducSuper ~2738)
 *  - RHO_AR_N, arRho, arWmass, xtDefault, arXt, cvReqAr: linhas 2803-2820
 *    (renderReducAr ~2822)
 *  - aguaRho: linha ~2011 (junto de vaporVol/vaporTemp)
 *  - aguaRhoT, aguaSG, aguaDpChoked, cvReqAgua, fluxoAgua, aguaVol: linhas
 *    2949-2957 (renderReducAgua ~2998)
 * ========================================================================= */

// é borboleta (possui tabela Cv x ângulo)? — linha 2515
function isBorboleta(modelo) { return !!(CVANG[modelo]); }

/* ---------- vapor superaquecido (gás ideal) — linhas 2733-2734 ---------- */
function vaporVolSup(barg, Tc) { const r = steamLookup(barg); const Ts = vaporTemp(barg); return r.vV * ((Tc + 273.15) / (Ts + 273.15)); }
function khSup(P1barg, T1c) { const Ts = vaporTemp(P1barg); return (T1c > Ts) ? Math.sqrt((T1c + 273.15) / (Ts + 273.15)) : 1; }

/* ---------- ar comprimido (gás, IEC 60534-2-1) — linhas 2803-2820 ---------- */
const RHO_AR_N = 1.2922; // ar normal: 0 °C, 1,01325 bar (gás ideal)
function arRho(Pg, T1) { const ATMl = 1.01325; return ((Pg + ATMl) * 1e5) / (287.05 * ((isNaN(T1) ? 20 : T1) + 273.15)); }
function arWmass(Q, unit, Pg, T1) { // Q -> W [kg/h]
  if (unit === 'nm3h') return Q * RHO_AR_N;
  if (unit === 'm3h') return Q * arRho(Pg, T1);
  return Q; // kgh
}
function xtDefault(modelo) { return isBorboleta(modelo) ? 0.45 : 0.72; }
function arXt(modelo, sz) { const md = VALV[modelo] || {}; const v = md.xt && md.xt[sz]; return (v != null && v !== '') ? Number(v) : xtDefault(modelo); }
function cvReqAr(P1g, P2g, Wkgh, T1, xT) {
  const ATMl = 1.01325, Fk = 1.0;            // k_ar≈1,40 -> Fk≈1
  const P1a = P1g + ATMl, x = (P1g - P2g) / P1a;
  const xch = Fk * xT, xx = Math.min(x, xch), Y = 1 - xx / (3 * xch);
  const rho1 = arRho(P1g, T1);
  const Kv = Wkgh / (27.3 * Y * Math.sqrt(xx * P1a * rho1));
  return 1.156 * Kv;                       // Cv
}

/* ---------- água (redução de pressão) — linha ~2011 e 2949-2957 ---------- */
const aguaRho = t => interpC(ENG.water.T_C, ENG.water.rho_kgm3, t);
function aguaRhoT(T) { const r = aguaRho(T == null || isNaN(T) ? 20 : T); return (r == null || isNaN(r)) ? 998 : r; }
function aguaSG(T) { return aguaRhoT(T) / 1000; }
function aguaDpChoked(P1, T) { const FL = 0.9, Pc = 220.6, ATMl = 1.01325; const Tc = (T == null || isNaN(T)) ? 20 : T; const Pv = Math.max(vaporPress(Tc), 0); const FF = 0.96 - 0.28 * Math.sqrt(Math.max(Pv / Pc, 0)); return FL * FL * ((P1 + ATMl) - FF * Pv); }
function cvReqAgua(P1, P2, Qm3h, T) { const dp = P1 - P2; if (dp <= 0) return NaN; const sg = (T == null ? 1 : aguaSG(T)); const dch = aguaDpChoked(P1, T); const dpEff = (dch > 0 && dp > dch) ? dch : dp; return 1.16 * Qm3h * Math.sqrt(sg / dpEff); }
function fluxoAgua(P1, P2) { return (P1 - P2) < (P1 / 2) ? "Subcrítico" : "Crítico"; }
function aguaVol(flowInput, unit, T) { return unit === 'kg' ? (flowInput / aguaRhoT(T)) : flowInput; }

/* ---------- computeReducSuper: motor para renderReducSuper (~linha 2738) ---------- */
export function computeReducSuper({ pin, pout, flow, T1, sch, activeModels } = {}) {
  pin = Number(pin); pout = Number(pout); flow = Number(flow); T1 = Number(T1);
  const Tsat1 = vaporTemp(pin), Tsat2 = vaporTemp(pout);

  // err: string pronta para os dois casos SEM formatação por unidade (idêntico
  // ao index.html). errCode: para os dois casos cuja mensagem original embute
  // valores formatados por unidade (uT/uP) — o cliente já tem pin/T1 localmente
  // (leu via uBase antes do fetch) e recebe Tsat1/Tsat2 daqui para remontar o
  // texto EXATO com uT()/uP(), que continuam no index.html (não duplicados aqui).
  let err = null, errCode = null;
  if (pin <= pout) { err = "Pressão de entrada deve ser maior que a de saída."; errCode = 'p1_le_p2'; }
  else if (flow <= 0) { err = "Vazão deve ser maior que 0."; errCode = 'flow_le_0'; }
  else if (!(T1 > Tsat1)) { errCode = 'not_superheated'; }
  else if (T1 > 600) { errCode = 'temp_over_limit'; }
  const hasErr = !!errCode;

  const Ksh = hasErr ? 1 : khSup(pin, T1);
  const CVp = hasErr ? 0 : cvReq(pin, pout, flow) * Ksh;
  const kv = CVp * 0.865;
  const regime = (pin - pout < 0.42 * pin) ? "Subcrítico" : "Crítico";

  const models = [];
  if (!hasErr) {
    const list = Array.isArray(activeModels)
      ? activeModels.filter(m => VALV[m] && valveAbas(m).includes('vaporsup'))
      : modelsForTabAll('vaporsup');
    const _dpC = pin - pout;
    for (const modelo of list) {
      const md = VALV[modelo];
      if (!md) continue;
      const pmAdm = pmaxValv(modelo, Tsat1); // = pmaxValv(modelo, vaporTemp(pin))
      const excede = pmAdm != null && pin > pmAdm;
      const m = { modelo, pmAdm: (pmAdm == null ? null : pmAdm), excede, rows: [] };
      if (!excede) {
        m.rows = sortedSizes(md).map(([sz, cvv]) => {
          const Q = (flow / CVp) * cvv;
          const ab = aberturaFrac(modelo, sz, CVp, cvv);
          const _dm = (md.dpmax && md.dpmax[sz]);
          const dpOver = (_dm != null && _dm !== "" && _dpC > Number(_dm));
          return { sz, cvv, rcv: CVp / cvv, Q, ab, dpOver, dpm: (_dm == null || _dm === "") ? null : _dm };
        });
      }
      models.push(m);
    }
  }

  let vel = [];
  if (!hasErr) {
    const D = SCHED[sch] || SCHED['40'];
    const order = Object.keys(D).sort((a, b) => parseInch(a) - parseInch(b));
    // gás ideal: laminação isentálpica ~ isotérmica -> T~T1 nas duas pressões
    vel = order.map(sz => {
      const id = D[sz];
      const A = Math.PI / 4 * Math.pow(id / 1000, 2);
      const vin = (flow / 3600) * vaporVolSup(pin, T1) / A;
      const vout = (flow / 3600) * vaporVolSup(pout, T1) / A;
      return { sz, vin, vout };
    });
  }

  return { err, errCode, CVp, kv, regime, Tsat1, Tsat2, Ksh, models, vel };
}

/* ---------- computeReducAr: motor para renderReducAr (~linha 2822) ---------- */
export function computeReducAr({ pin, pout, flow, T1, sch, activeModels } = {}) {
  pin = Number(pin); pout = Number(pout); const Q = Number(flow); T1 = Number(T1);
  const unit = 'nm3h'; // igual ao index.html: aba de ar sempre usa Nm³/h internamente

  let err = null;
  if (pin <= pout) err = "Pressão de entrada deve ser maior que a de saída.";
  else if (Q <= 0) err = "Vazão deve ser maior que 0.";
  else if (isNaN(T1)) err = "Informe a temperatura de entrada.";
  const hasErr = !!err;

  const W = hasErr ? 0 : arWmass(Q, unit, pin, T1);
  const rho1 = arRho(pin, T1);
  const x = (pin - pout) / (pin + 1.01325);

  const models = [];
  if (!hasErr) {
    const list = Array.isArray(activeModels)
      ? activeModels.filter(m => VALV[m] && valveAbas(m).includes('ar'))
      : modelsForTabAll('ar');
    const _dpC = pin - pout;
    const T1eff = isNaN(T1) ? 20 : T1;
    for (const modelo of list) {
      const md = VALV[modelo];
      if (!md) continue;
      const pmAdm = pmaxValv(modelo, T1eff);
      const excede = pmAdm != null && pin > pmAdm;
      const m = { modelo, pmAdm: (pmAdm == null ? null : pmAdm), excede, rows: [] };
      if (!excede) {
        m.rows = sortedSizes(md).map(([sz, cvv]) => {
          const xt = arXt(modelo, sz);
          const CVp = cvReqAr(pin, pout, W, T1, xt);
          const Q2 = (Q / CVp) * cvv;
          const ab = aberturaFrac(modelo, sz, CVp, cvv);
          const _dm = (md.dpmax && md.dpmax[sz]);
          const dpOver = (_dm != null && _dm !== "" && _dpC > Number(_dm));
          return { sz, cvv, rcv: CVp / cvv, Q: Q2, ab, xt, cvp: CVp, dpOver, dpm: (_dm == null || _dm === "") ? null : _dm };
        });
      }
      models.push(m);
    }
  }

  let vel = [];
  if (!hasErr) {
    const D = SCHED[sch] || SCHED['40'];
    const order = Object.keys(D).sort((a, b) => parseInch(a) - parseInch(b));
    vel = order.map(sz => {
      const id = D[sz];
      const A = Math.PI / 4 * Math.pow(id / 1000, 2);
      const vin = (W / 3600) / arRho(pin, T1) / A;
      const vout = (W / 3600) / arRho(pout, T1) / A;
      return { sz, vin, vout };
    });
  }

  return { err, W, rho1, RHO_AR_N, x, models, vel };
}

/* ---------- computeReducAgua: motor para renderReducAgua (~linha 2998) ---------- */
export function computeReducAgua({ pin, pout, flow, T, sch, activeModels } = {}) {
  pin = Number(pin); pout = Number(pout); const fin = Number(flow); T = Number(T);

  let err = null, errCode = null;
  if (pin <= pout) { err = "Pressão de entrada deve ser maior que a de saída."; errCode = 'p1_le_p2'; }
  else if (fin <= 0) { err = "Vazão deve ser maior que 0."; errCode = 'flow_le_0'; }

  // bloqueio por temperatura de saturação (água permanece líquida)
  const Tsat1 = vaporTemp(pin), Tsat2 = vaporTemp(pout);
  let flashing = false;
  if (!err && !isNaN(T)) {
    if (T > Tsat1 + 0.05) { errCode = 'not_liquid'; }      // mensagem unit-dependente -> remontada no cliente
    else if (T > Tsat2 + 0.05) { flashing = true; }
  }
  const hasErr = !!(err || errCode);

  const rho = aguaRhoT(T);
  const Qv = hasErr ? 0 : aguaVol(fin, 'kg', T); // aguaUnit() no index.html sempre retorna 'kg'
  const CVp = hasErr ? 0 : cvReqAgua(pin, pout, Qv, T);
  const kv = CVp * 0.865;
  const regime = hasErr ? null : fluxoAgua(pin, pout);
  const dpChoked = aguaDpChoked(pin, T);

  const models = [];
  if (!hasErr) {
    const list = Array.isArray(activeModels)
      ? activeModels.filter(m => VALV[m] && valveAbas(m).includes('agua'))
      : modelsForTabAll('agua');
    const _dpC = pin - pout;
    for (const modelo of list) {
      const md = VALV[modelo];
      if (!md) continue;
      const pmAdm = pmaxValv(modelo, T);
      const excede = pmAdm != null && pin > pmAdm;
      const m = { modelo, pmAdm: (pmAdm == null ? null : pmAdm), excede, rows: [] };
      if (!excede) {
        m.rows = sortedSizes(md).map(([sz, cvv]) => {
          const Q = (fin / CVp) * cvv;
          const ab = aberturaFrac(modelo, sz, CVp, cvv);
          const _dm = (md.dpmax && md.dpmax[sz]);
          const dpOver = (_dm != null && _dm !== "" && _dpC > Number(_dm));
          return { sz, cvv, rcv: CVp / cvv, Q, ab, dpOver, dpm: (_dm == null || _dm === "") ? null : _dm };
        });
      }
      models.push(m);
    }
  }

  let vel = [];
  if (!hasErr) {
    const D = SCHED[sch] || SCHED['40'];
    const order = Object.keys(D).sort((a, b) => parseInch(a) - parseInch(b));
    vel = order.map(sz => {
      const A = Math.PI / 4 * Math.pow(D[sz] / 1000, 2);
      const v = (Qv / 3600) / A;
      return { sz, v };
    });
  }

  return { err, errCode, flashing, Tsat1, Tsat2, rho, Qv, CVp, kv, regime, dpChoked, models, vel };
}

export {
  ENG, VALV, SCHED, CVANG, CVANG_DEG, VB_PT, AGUA_MODELS, VDB,
  interp, interpC, vaporVol, vaporTemp, vaporPress, ATM,
  cvReq, parseInch, vaporVolWet, sortedSizes, pmaxValv, aberturaFrac,
  valveAbas, modelsForTabAll, steamLookup, isBorboleta,
  vaporVolSup, khSup, RHO_AR_N, arRho, arWmass, xtDefault, arXt, cvReqAr,
  aguaRho, aguaRhoT, aguaSG, aguaDpChoked, cvReqAgua, fluxoAgua, aguaVol,
};
