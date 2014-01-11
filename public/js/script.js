$('.alert-success').hide();
$('.alert-danger').hide();

// Switch Btn
var value = $('#Active').val(),
  $switch = $('#switch');

$switch.prop('checked', value == 1 ? true : false);
$switch.bootstrapSwitch();

$switch.on('switch-change', function(e, data) {
  var value = data.value; // console.log(e, $element, value);

  $('#Active').val(value ? 1 : 0);

  setTimeout(function() {
    $('#form').trigger('submit');
  }, 1000);

});

$('#form').on('submit', function(event) {
  event.preventDefault();

  $('.alert-success').hide();
  $('.alert-danger').hide();

  var form = $(this).serialize();

  var jqxhr = $.post('/admin', form, function(data) {
    if (data.status === 1) {
      $('.alert-success').show();
    } else {
      $('.alert-danger').text(data.message).show();
    }
  })
    .fail(function() {
      $('.alert-danger').text('Something went badly wrong while saving the new configuration.').show();
    })
    .always(function() {
      window.scrollTo(0, 0);
    });
});