
//GET DATA=================================
// get csv files from working group github repository
var file_dist_prov = "https://raw.githubusercontent.com/ishaberry/Covid19Canada/master/timeseries_prov/vaccine_distribution_timeseries_prov.csv";

var file_admin_prov = "https://raw.githubusercontent.com/ishaberry/Covid19Canada/master/timeseries_prov/vaccine_administration_timeseries_prov.csv";

var file_dist_canada = "https://raw.githubusercontent.com/ishaberry/Covid19Canada/master/timeseries_canada/vaccine_distribution_timeseries_canada.csv";

var file_admin_canada = "https://raw.githubusercontent.com/ishaberry/Covid19Canada/master/timeseries_canada/vaccine_administration_timeseries_canada.csv";

//CHANGE
var file_planned = "https://raw.githubusercontent.com/sitrucp/covid_canada_vaccinations/master/planned.csv";

//var file_planned = "/ws_covid_vaccination_canada/planned.csv";

var file_population = "https://raw.githubusercontent.com/sitrucp/covid_canada_vaccinations/master/population.csv";

var file_update_time = "https://raw.githubusercontent.com/ishaberry/Covid19Canada/master/update_time.txt";

Promise.all([
    d3.csv(file_dist_prov),
    d3.csv(file_admin_prov),
    d3.csv(file_dist_canada),
    d3.csv(file_admin_canada),
    d3.csv(file_planned),
    d3.csv(file_population),
    d3.csv(file_update_time)
]).then(function(data) {
    //everthing else below is in d3 promise scope

    // get data sets from promise
    var arrDistProv = data[0];
    var arrAdminProv = data[1];
    var arrDistCanada = data[2];
    var arrAdminCanada = data[3];
    var arrPlanned = data[4];
    var arrPopulation = data[5];
    var updateTime = data[6];

    // get update time from working group repository
    lastUpdated = updateTime.columns[0];
    
    document.getElementById('last_update').innerHTML += ' <small class="text-muted">Last updated: ' + lastUpdated + '</small>';

    // ggt dist and admin totals by summing values
    var distTotalCanada = arrDistCanada.reduce((a, b) => +a + +b.dvaccine, 0);
    var adminTotalCanada = arrAdminCanada.reduce((a, b) => +a + +b.avaccine, 0);
    var planTotalCanada = arrPlanned.reduce((a, b) => +a + +b.avaccine, 0); // use this if arrPlanned data is at prov level but currently it is only Canada level

    // filter province arrPopulation dataset by age_group
    var sel_age_group = '18 years and over';
    var arrPopulationFiltered = arrPopulation.filter(function(d) { 
        return d.age_group == sel_age_group;
    });
    
    // percent population variable, could make user selected eg 100% or 75% etc
    var popPercent = 1;

    // summarize population dataset by Canada
    var popCanada = arrPopulationFiltered.reduce((a, b) => +a + +b.population, 0);

    // summarize population dataset by province
    var arrPopulationProv = d3.nest()
        .key(function(d) { return d.geo; })
        .rollup(function(v) { return {
            population: d3.sum(v, function(d) { return d.population; })
            };
        })
        .entries(arrPopulationFiltered)
        .map(function(group) {
            return {
            province: group.key,
            population: group.value.population
            }
        });

    // reformat dates, calculate % dist/admin of population
    arrDistProv.forEach(function(d) {
        d.report_date = reformatDate(d.date_vaccine_distributed)
        d.prov_date = d.province + '|' + d.date_vaccine_distributed
    });

    arrAdminProv.forEach(function(d) {
        d.report_date = reformatDate(d.date_vaccine_administered)
        d.prov_date = d.province + '|' + d.date_vaccine_administered
    });

    arrPlanned.forEach(function(d) {
        d.report_date = reformatDate(d.report_date)
        d.prov_date = d.province + '|' + d.report_date
    });

    arrDistCanada.forEach(function(d) {
        d.report_date = reformatDate(d.date_vaccine_distributed)
        d.prov_date = d.province + '|' + d.date_vaccine_distributed
        d.population = popCanada
    });

    arrAdminCanada.forEach(function(d) {
        d.report_date = reformatDate(d.date_vaccine_administered)
        d.prov_date = d.province + '|' + d.date_vaccine_administered
    });

    // left join admin to dist - Canada
    const arrDistAdminCanadaPop = equijoinWithDefault(
        arrDistCanada, arrAdminCanada, 
        "prov_date", "prov_date", 
        ({province, report_date, dvaccine, cumulative_dvaccine, population}, {avaccine, cumulative_avaccine}, ) => 
        ({province, report_date, dvaccine, cumulative_dvaccine, avaccine, cumulative_avaccine, population}), 
        {prov_date:null, avaccine:"0", cumulative_avaccine:"0"});

    // add percentages to distAdminCanada
    arrDistAdminCanadaPop.forEach(function(d) {
        d.pct_pop_dist = parseInt(d.cumulative_dvaccine) / parseInt(d.population)
        d.pct_pop_admin = parseInt(d.cumulative_avaccine) / parseInt(d.population)
        d.pct_dist_admin = parseInt(d.cumulative_avaccine) / parseInt(d.cumulative_dvaccine)
        d.count_type = 'actual'
    });

    // left join admin to dist - Provinces
    const arrDistAdminProv = equijoinWithDefault(
        arrDistProv, arrAdminProv, 
        "prov_date", "prov_date", 
        ({province, report_date, dvaccine, cumulative_dvaccine}, {avaccine, cumulative_avaccine}, ) => 
        ({province, report_date, dvaccine, cumulative_dvaccine, avaccine, cumulative_avaccine}), 
        {avaccine:"0", cumulative_avaccine:"0"});

    // map population to arrDistAdminProv
    const arrDistAdminProvPop = arrDistAdminProv.map(t1 => ({...t1, ...arrPopulationProv.find(t2 => t2.province === t1.province)}))

    // add percentages to arrDistAdminProvPop
    arrDistAdminProvPop.forEach(function(d) {
        d.pct_pop_dist = parseInt(d.cumulative_dvaccine) / parseInt(d.population)
        d.pct_pop_admin = parseInt(d.cumulative_avaccine) / parseInt(d.population)
        d.pct_dist_admin = parseInt(d.cumulative_avaccine) / parseInt(d.cumulative_dvaccine)
        d.count_type = 'actual'
    });

    // get canada dist & admin max dates
    var maxDistDate = d3.max(arrDistCanada.map(d=>d.report_date));
    var maxAdminDate = d3.max(arrAdminCanada.map(d=>d.report_date));

    function createFutureData(popDose, maxDate, dist, admin, prov) {
        // maxDate is max date in original data eg last date reported
        // this is date that future projected data starts

        // calculate daysRemaining (# days) eg maxDate to Sep 30
        var daysRemaining = daysToGoalDate();

        // create future data
        var arrFutureData = [];
        var province = prov;
        var avaccine_full_req = (popDose - admin)
        var dvaccine_full_req = (popDose - dist)
        var avaccine = avaccine_full_req / daysRemaining;
        var dvaccine = dvaccine_full_req / daysRemaining;

        // loop through days remaining to create new calculated records
        for (var i=1; i<daysRemaining; i++) { 

            var report_date = new Date(maxDate);
            
            report_date.setDate(report_date.getDate() + i);
            var prov_date = province + '|' + report_date;
            var cumulative_avaccine = admin + (avaccine * i);
            var cumulative_dvaccine = dist + (dvaccine * i);
            var pct_dist_admin = cumulative_avaccine / cumulative_dvaccine;
            var pct_pop_admin = cumulative_avaccine / popDose;
            var pct_pop_dist = cumulative_dvaccine / popDose;
            var count_type = 'required';

            arrFutureData.push({
                province,
                report_date, 
                prov_date,
                avaccine, 
                dvaccine, 
                cumulative_avaccine, 
                cumulative_dvaccine, 
                pct_dist_admin,
                pct_pop_admin,
                pct_pop_dist,
                count_type
            });
        }

        return arrFutureData;
    }

    // create days remaining
    function daysToGoalDate() {
        var endDate = new Date("9/30/2021");
        return Math.floor((endDate - maxAdminDate) / (1000*60*60*24))
    }

    // assign bar color for actual and calculated y values
    function fillColor(x, maxDate) {
        colors = [];
        for (var i=0; i<x.length; i++) {
            if (Date.parse(x[i]) > Date.parse(maxDate)) {
                colors.push('rgba(204,204,204, .9)'); // gray
            } else {
                colors.push('rgba(49,130,189, .9)'); // blue
            }
        }
        return colors
    }

    var colActual = '#ffffb2';
    var colFuture = 'rgba(204,204,204, .9)';
    var colActual = '#fd8d3c';
    var colActual = '#f03b20';
    var colActual = '#bd0026';

    function createCanadaChart() {

        // ggt dist and admin totals by summing values, and population using max
        var province = "Canada";
        var max_pct_dist_admin = d3.max(arrDistAdminCanadaPop.map(d=>d.pct_dist_admin));
        var population = d3.max(arrDistAdminCanadaPop.map(d=>d.population));
        var dosePopulation = parseInt((population * 2) * popPercent);
        var max_pct_dist_admin = d3.max(arrDistAdminCanadaPop.map(d=>d.pct_dist_admin));

        // get future data
        var arrFutureData = createFutureData(dosePopulation, maxAdminDate, distTotalCanada, adminTotalCanada, province);

        // concat arrPlanned to future
        // var dataConcat = dataConcatFuture.concat(arrPlanned);
        // for stacked bar, need multiple trace/data set, one for actual, one for arrPlanned, one for projected

        // left join future to arrPlanned on date
        const arrFuturePlanned = equijoinWithDefault(
            arrFutureData, arrPlanned, 
            "prov_date", "prov_date", 
            ({province, report_date, prov_date, count_type, avaccine, dvaccine}, {daily_moderna, daily_pfizer, daily_other, daily_total, total_cumulative}, ) => 
            ({province, report_date, prov_date, count_type, avaccine, dvaccine, daily_moderna, daily_pfizer, daily_other, daily_total, total_cumulative}), 
            {daily_moderna:"0", daily_pfizer:"0", daily_other:"0", daily_total:"0", total_cumulative:"0"});
            
        // create new 'required' value for future minus planned, if any planned
        arrFuturePlanned.forEach(function(d) {
            d.required = parseInt(d.avaccine);
            
            if ( parseInt(d.daily_total.replace(/,/g, '')) < parseInt(d.avaccine)) {
                d.required = parseInt(d.avaccine) - parseInt(d.daily_total.replace(/,/g, ''));
            } else {
                d.required = 0;
            }
            
        });

        // CREATE CANADA CHART

        // create x and y axis data sets
        var xActual = [];
        var yActual = [];
        var xFuture = [];
        var yFuture = [];

        // create axes x and y arrays
        for (var i=0; i<arrDistAdminCanadaPop.length; i++) {
            var row = arrDistAdminCanadaPop[i];
            xActual.push(row['report_date']);
            yActual.push(parseInt(row['avaccine']));
        }

        for (var i=0; i<arrFuturePlanned.length; i++) {
            var row = arrFuturePlanned[i];
            xFuture.push(row['report_date']);
            yFuture.push(parseInt(row['avaccine']));
        }

        var actual = {
            name: 'Actual Doses',
            x: xActual,
            y: yActual,
            showgrid: false,
            type: 'bar',
            marker:{
                color: fillColor(xActual, maxAdminDate)
            },
        };

        var future = {
            name: 'Doses To Meet Goal',
            x: xFuture,
            y: yFuture,
            showgrid: false,
            //type: 'line',
            type: 'bar',
            marker:{
                color: 'rgba(204,204,204, .9)'
                //color: fillColor(xFuture, maxAdminDate)
            },
        };

        var layout = {
            title: {
                text:'Canada COVID-19 Vaccine Dose Administration <br> Required To Meet Sep 30 Goal',
                font: {
                    size: 14
                },
            },
            barmode: 'relative',
            showlegend: true,
            legend: {
                "y": 1.07, 
                "x": 0.15,
                legend_title_text: "",
                orientation: "h",
                bgcolor: 'rgba(0,0,0,0)',
            },
            yaxis: { 
                title: {
                    text: 'daily',
                    font: {
                        size: 11,
                    },
                },
                tickfont: {
                    size: 11
                },
                showgrid:false
            },
            xaxis: { 
                tickfont: {
                    size: 11
                },
                showgrid: false,
            },
            autosize: true,
            autoscale: false,
            margin: {
                l: 60,
                r: 60,
                b: 80,
                t: 80,
                pad: 2
            },
        }

        // create divs, para for Canada chart
        var canadaDiv = 'canadaDiv';
        var canadaTitle = 'title' + canadaDiv;
        var titleCanadaChart = document.createElement("p");
        var div_canada_chartItem = document.createElement("div");
        div_canada_chartItem.id = canadaDiv;
        titleCanadaChart.id = canadaTitle;

        var chartDetails = '<ul class="list-unstyled"><li><h4>' + province + '</h4>' +
            
        '</li><li>Target Popluation ('+ parseInt(popPercent * 100) + '% Age 18+): ' + population.toLocaleString() + '</li>' + 

        '<li>Doses Distributed: ' + distTotalCanada.toLocaleString() + '</li>' +

        '<li>Doses Administered: ' + adminTotalCanada.toLocaleString() + '</li>' +

        '<li>Distributed Doses Administered: ' + ((adminTotalCanada/distTotalCanada) * 100).toFixed(1) + '%</li>' +

        '<li>Doses Required To Fully Vaccinate Target Pop: ' + (dosePopulation).toLocaleString() + '</li>' +
        
        '<li>Doses Remaining To Fully Vaccinate Target Pop: ' + (dosePopulation - adminTotalCanada).toLocaleString() + ' </li>' +

        '<li>Target Population Doses Administered: ' + ((adminTotalCanada / dosePopulation) * 100).toFixed(2) + '%</li>' +
        
        '<li>' + parseInt(((dosePopulation - adminTotalCanada) / daysToGoalDate())).toLocaleString() + ' doses must be adminstered daily, starting today, to meet Sep 30 goal.</li>' +

        '<li class="small font-italic"">Click "Read More" link above for details on calculations.</li>' +
        '</ul>';

        titleCanadaChart.innerHTML  = chartDetails;
        document.getElementById('div_canada_chart').append(titleCanadaChart);
        document.getElementById('div_canada_chart').append(div_canada_chartItem);

        var data = [actual, future];
        Plotly.newPlot('canadaDiv', data, layout);

    }

    function createCanadaPlannedChart() {

        // ggt dist and admin totals by summing values, and population using max
        var province = "Canada";
        var population = d3.max(arrDistAdminCanadaPop.map(d=>d.population));
        var dosePopulation = parseInt((population * 2) * popPercent);

        // get future data
        var arrFutureData = createFutureData(dosePopulation, maxAdminDate, distTotalCanada, adminTotalCanada, province);

        // concat arrPlanned to future
        // var dataConcat = dataConcatFuture.concat(arrPlanned);
        // for stacked bar, need multiple trace/data set, one for actual, one for arrPlanned, one for projected

        // left join future to arrPlanned on date
        const arrFuturePlanned = equijoinWithDefault(
            arrFutureData, arrPlanned, 
            "prov_date", "prov_date", 
            ({province, report_date, prov_date, count_type, avaccine, dvaccine}, {daily_moderna, daily_pfizer, daily_other, daily_total, total_cumulative}, ) => 
            ({province, report_date, prov_date, count_type, avaccine, dvaccine, daily_moderna, daily_pfizer, daily_other, daily_total, total_cumulative}), 
            {daily_moderna:"0", daily_pfizer:"0", daily_other:"0", daily_total:"0", total_cumulative:"0"});
            
        // create new 'required' value for future minus planned, if any planned
        arrFuturePlanned.forEach(function(d) {
            d.required = parseInt(d.avaccine);
            
            if ( parseInt(d.daily_total.replace(/,/g, '')) < parseInt(d.avaccine)) {
                d.required = parseInt(d.avaccine) - parseInt(d.daily_total.replace(/,/g, ''));
            } else {
                d.required = 0;
            }
            
        });

        // CREATE CANADA CHART

        // create x and y axis data sets
        var xActual = [];
        var yActual = [];
        var xPfizer = [];
        var yPfizer = [];
        var xModerna = [];
        var yModerna = [];
        var xOther = [];
        var yOther = [];
        var xCumulative = [];
        var yCumulative = [];

        // create axes x and y arrays
        for (var i=0; i<arrDistAdminCanadaPop.length; i++) {
            var row = arrDistAdminCanadaPop[i];
            xActual.push(row['report_date']);
            yActual.push(parseInt(row['avaccine']));
            xCumulative.push(row['report_date']);
            yCumulative.push(parseInt(row['cumulative_avaccine']));
        }

        for (var i=0; i<arrFuturePlanned.length; i++) {
            var row = arrFuturePlanned[i];
            xPfizer.push(row['report_date']);
            yPfizer.push(parseInt(row['daily_pfizer'].replace(/,/g, '')));
            xModerna.push(row['report_date']);
            yModerna.push(parseInt(row['daily_moderna'].replace(/,/g, '')));
            xOther.push(row['report_date']);
            yOther.push(parseInt(row['daily_other'].replace(/,/g, '')));
            xCumulative.push(row['report_date']);
            yCumulative.push(parseInt(row['total_cumulative'].replace(/,/g, '')));
        }

        var actual = {
            name: 'Actual Doses',
            x: xActual,
            y: yActual,
            showgrid: false,
            type: 'bar',
            marker:{
                color: fillColor(xActual, maxAdminDate)
            },
        };
        
        // optional planned vaccines
        var pfizer = {
            name: 'Planned Pfizer',
            x: xPfizer,
            y: yPfizer,
            showgrid: false,
            type: 'bar',
            marker:{
                color: '#bd0026'
                //color: fillColor(xPlan, maxAdminDate)
            },
        };

        var moderna = {
            name: 'Planned Moderna',
            x: xModerna,
            y: yModerna,
            showgrid: false,
            type: 'bar',
            marker:{
                color: '#f03b20'
                //color: fillColor(xPlan, maxAdminDate)
            },
        };

        var other = {
            name: 'Planned Other',
            x: xOther,
            y: yOther,
            showgrid: false,
            type: 'bar',
            marker:{
                color: '#fd8d3c'
                //color: fillColor(xPlan, maxAdminDate)
            },
        };

        // add cumulative people vaxxed eg 2x doses

        var cumulative = {
            name: 'Cumulative Doses',
            x: xCumulative,
            y: yCumulative,
            yaxis: 'y2',
            showgrid: false,
            type: 'line',
            marker:{
                color: '#333',
            },
        };

        var layout = {
            title: {
                text:'Canada COVID-19 Planned Vaccine Dose Administration <br> 40m Pfizer & 40m Moderna By Sep 30',
                font: {
                    size: 14
                },
            },
            barmode: 'relative',
            showlegend: true,
            legend: {
                "y": 1.07, 
                "x": 0.15,
                legend_title_text: "",
                orientation: "h",
                bgcolor: 'rgba(0,0,0,0)',
            },
            yaxis: { 
                title: {
                    text: 'daily',
                    font: {
                        size: 11,
                    },
                },
                tickfont: {
                    size: 11
                },
                showgrid:false
            },
            yaxis2: {
                title: {
                    text: 'cumulative',
                    font: {
                        size: 11,
                    },
                },
                overlaying: 'y',
                side: 'right',
                showgrid: false,
                rangemode: 'tozero',
            },
            xaxis: { 
                tickfont: {
                    size: 11
                },
                showgrid: false,
            },
            autosize: true,
            autoscale: false,
            margin: {
                l: 60,
                r: 60,
                b: 80,
                t: 80,
                pad: 2
            },
        }

        // create divs, para for Canada planned chart
        var canadaPlanDiv = 'canadaPlanDiv';
        var canadaPlanTitle = 'title' + canadaPlanDiv;
        var titleCanadaPlanChart = document.createElement("p");
        var div_canada_plan_chartItem = document.createElement("div");
        div_canada_plan_chartItem.id = canadaPlanDiv;
        titleCanadaPlanChart.id = canadaPlanTitle;

        var chartDetails = '<h4>' + province + '</h4>' +
            
        '<p><strong>COVID-19 Pfizer & Moderna Vaccine Roll-Out Forecast</strong></p>' +

        '<p>The Canadian government has said it has commitments for delivery of 40m Pfizer & 40m Moderna by Sep 30, 2021. Based on this, and other statements detailed below, an estimated delivery forecast is provided in the bullet points and visualization below.</p>' +
        
        '<ul>' + 

        '<li>By Mar 31: GoC has said it has commitments for 4m Pfizer & 2m Moderna by Mar 31.</li>' +
        
        '<li>Apr 1 to Jun 30: GoC has said it has commitments for 20m doses to be delivered in this period, though has not specified vaccine allocation. Based on Feb and Mar deliveries, a forecast is 13m Pfizer & 7m Moderna.</li>' +
        
        '<li>Jul 1 to Sep 30: Based on above deliveries, the forecast allocation in this phase is 23m Pfizer & 31m Moderna (amounts remaining to get 40m total each).</li>' +
        
        '<li>The daily amounts shown in the visualization are calculated by dividing amounts by number of days in the phase. The cumulative daily amount measure tracks progress towards complete 80m doses. Note that only about 61m doses are needed to vaccinate age 18+ population. The visualization shows 61m doses being achieved by Aug 28, 2021 which is probably a bit too optimistic.</li>' +

        '</ul>';

        titleCanadaPlanChart.innerHTML = chartDetails;
        document.getElementById('div_canada_plan_chart').append(titleCanadaPlanChart);
        document.getElementById('div_canada_plan_chart').append(div_canada_plan_chartItem);

        var data = [actual, pfizer, moderna, cumulative];
        Plotly.newPlot('canadaPlanDiv', data, layout);

    }

    function createProvChart() {
        // CREATE PROV CHART

        // get list of provinces 
        provListTemp = [];
        for (var i=0; i<arrDistAdminProvPop.length; i++) {
            province = arrDistAdminProvPop[i]['province'];
            provListTemp.push(province);
        }
        let provList = [...new Set(provListTemp)];

        // create prov charts by loop through provList to create chart for each prov
        for (var j=0; j<provList.length; j++) {

            var provData = arrDistAdminProvPop.filter(function(d) { 
                return d.province === provList[j];
            });

            // ggt dist and admin totals by summing values, and population using max
            var distTotalProv = provData.reduce((a, b) => +a + +b.dvaccine, 0);
            var adminTotalProv = provData.reduce((a, b) => +a + +b.avaccine, 0);
            var population = d3.max(provData.map(d=>d.population));
            var dosePopulation = parseInt((population * 2) * popPercent);
            var max_pct_dist_admin = d3.max(provData.map(d=>d.pct_dist_admin));

            // get future data 
            var arrFutureData = createFutureData(dosePopulation, maxAdminDate, distTotalProv, adminTotalProv, provList[j]);

            // concat actual and future data
            //var dataConcat = provData.concat(arrFutureData);

            // CREATE PROV CHART
            // create x and y axis data sets
            // create x and y axis data sets
            var xActual = [];
            var xFuture = [];
            var xPlan = [];
            var yActual = [];
            var yFuture = [];
            var yPlan = [];

            // create axes x and y arrays
            for (var i=0; i<provData.length; i++) {
                var row = provData[i];
                xActual.push(row['report_date']);
                yActual.push(parseInt(row['avaccine']));
            }

            for (var i=0; i<arrFutureData.length; i++) {
                var row = arrFutureData[i];
                xFuture.push(row['report_date']);
                yFuture.push(parseInt(row['avaccine']));
            }

            // create Prov chart
            var actual = {
                name: 'Actual Doses',
                x: xActual,
                y: yActual,
                showgrid: false,
                fill: 'tozeroy',
                type: 'bar',
                marker:{
                    color: fillColor(xActual, maxAdminDate)
                },
            };
    
            var future = {
                name: 'Doses To Meet Goal',
                x: xFuture,
                y: yFuture,
                showgrid: false,
                fill: 'tozeroy',
                type: 'bar',
                marker:{
                    color: fillColor(xFuture, maxAdminDate)
                },
            };
            
            var layout = {
                showlegend: true,
                legend: {
                    "y": 1.07,  
                    "x": 0.3,
                    legend_title_text: "",
                    orientation: "h",
                    bgcolor: 'rgba(0,0,0,0)',
                },
                yaxis: { 
                    tickfont: {
                        size: 11
                    },
                    showgrid:false
                },
                xaxis: { 
                    tickfont: {
                        size: 11
                    },
                    showgrid:false
                },
                autosize: true,
                autoscale: false,
                margin: {
                    l: 30,
                    r: 40,
                    b: 80,
                    t: 80,
                    pad: 2
                },
                title: {
                    text: provList[j] + ' COVID-19 Vaccine Dose Administration <br> Required To Meet Sep 30 Goal',
                    font: {
                        size: 14
                    },
                },
            }

            // create divs, para for each province chart
            var provDiv = 'provDiv' + j;
            var provTitle = 'title' + provDiv;
            var titleProvChart = document.createElement("p");
            var div_prov_chartItem = document.createElement("div");
            div_prov_chartItem.id = provDiv;
            titleProvChart.id = provTitle;
            var chartDetails = '<ul class="list-unstyled"><li><h4>' + provList[j] + '</h4>' +
            
            '</li><li>Target Popluation ('+ parseInt(popPercent * 100) + '% Age 18+): ' + population.toLocaleString() + '</li>' + 

            '<li>Doses Distributed: ' + distTotalProv.toLocaleString() + '</li>' +

            '<li>Doses Administered: ' + adminTotalProv.toLocaleString() + '</li>' +

            '<li>Distributed Doses Administered: ' + ((adminTotalProv/distTotalProv) * 100).toFixed(1) + '%</li>' +

            '<li>Doses Required To Fully Vaccinate Target Pop: ' + (dosePopulation).toLocaleString() + '</li>' +
            
            '<li>Doses Remaining To Fully Vaccinate Target Pop: ' + (dosePopulation - adminTotalProv).toLocaleString() + ' </li>' +

            '<li>Target Population Doses Administered: ' + ((adminTotalProv / dosePopulation) * 100).toFixed(2) + '%</li>' +
            
            '<li>' + parseInt(((dosePopulation - adminTotalProv) / daysToGoalDate())).toLocaleString() + ' doses must be adminstered daily, starting today, to meet Sep 30 goal.</li>' +

            '<li class="small font-italic"">Click "Read More" link above for details on calculations.</li>' +
            '</ul>';

            titleProvChart.innerHTML  = chartDetails;
            document.getElementById('div_prov_chart').append(titleProvChart);
            document.getElementById('div_prov_chart').append(div_prov_chartItem);
            
            var data = [actual, future];
            Plotly.newPlot(provDiv, data, layout);

        }
    }

     // create charts
    // call createCharts when page loads
    createCanadaChart();
    createCanadaPlannedChart();
    createProvChart();

});

// left join function used to join datasets
function equijoinWithDefault(xs, ys, primary, foreign, sel, def) {
    const iy = ys.reduce((iy, row) => iy.set(row[foreign], row), new Map);
    return xs.map(row => typeof iy.get(row[primary]) !== 'undefined' ? sel(row, iy.get(row[primary])): sel(row, def));
};

// reformat date to date object
function reformatDate(oldDate) {
    // 17-12-2020 is working group date format
    var d = (oldDate).split('-');
    var newDate = new Date(d[1] + '/' + d[0] + '/' + d[2]);
    //var newDate = d[2] + '-' + d[1] + '-' + d[0]
    return newDate
}

// moving average function 
function movingAverage(values, N) {
    let i = 0;
    let sum = 0;
    const means = new Float64Array(values.length).fill(NaN);
    for (let n = Math.min(N - 1, values.length); i < n; ++i) {
        sum += values[i];
    }
    for (let n = values.length; i < n; ++i) {
        sum += values[i];
        means[i] = parseInt(sum / N);
        sum -= values[i - N + 1];
    }
    return means;
}

//hideShowDiv('read_more_div');

function hideShowDiv(id) {
   var e = document.getElementById(id);
   if(e.style.display == 'block')
      e.style.display = 'none';
   else
      e.style.display = 'block';
}